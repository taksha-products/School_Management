import { Types } from "mongoose";

import { GpsDevice, type GpsDeviceSyncStatus, type IGpsDevice } from "../models/GpsDevice";
import { isOrgFeatureEnabled } from "../middleware/featureFlag";
import {
  ensureTraccarDevice,
  setTraccarDeviceDisabled,
  updateTraccarDevice,
  getTraccarDevice,
  TraccarError
} from "./traccarClient";

/** 3-64 chars; letters, digits and . _ : - (covers IMEIs, phone ids and custom ids). */
export const TRACKER_ID_PATTERN = /^[A-Za-z0-9._:-]{3,64}$/;

export type BusTrackerStatus = GpsDeviceSyncStatus | "none" | "disabled";

/** What the API exposes about a bus's tracker. */
export interface BusTrackerView {
  trackerId: string | null;
  status: BusTrackerStatus;
  error: string | null;
  lastSeen: string | null;
}

export class TrackerConflictError extends Error {
  constructor(message = "This tracker ID is already assigned to another bus") {
    super(message);
    this.name = "TrackerConflictError";
  }
}

export const noTracker: BusTrackerView = {
  trackerId: null,
  status: "none",
  error: null,
  lastSeen: null
};

export const toTrackerView = (device: IGpsDevice | null | undefined): BusTrackerView => {
  if (!device) {
    return noTracker;
  }
  return {
    trackerId: device.traccarUniqueId,
    status: device.isActive ? device.syncStatus : "disabled",
    error: device.syncError ?? null,
    lastSeen: device.lastSeen ? device.lastSeen.toISOString() : null
  };
};

/** Normalises user input: undefined = leave unchanged, null = remove, string = set. */
export const normalizeTrackerId = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null) {
    return null;
  }
  if (typeof value !== "string") {
    throw new TypeError("trackerId must be a string");
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
};

interface BusRef {
  _id: Types.ObjectId;
  busNumber: string;
  status: "active" | "inactive";
}

const deviceName = (bus: BusRef): string => `Bus ${bus.busNumber}`;

const isDuplicateKeyError = (error: unknown): boolean =>
  (error as { code?: number } | null)?.code === 11000;

/**
 * Saves the device row, turning a unique-index violation into a clean conflict. Doing this
 * BEFORE calling Traccar means concurrent requests for the same tracker ID are settled by the
 * database, and the loser never touches Traccar.
 */
const claimTracker = async (device: IGpsDevice): Promise<void> => {
  try {
    await device.save();
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      throw new TrackerConflictError();
    }
    throw error;
  }
};

const safeErrorMessage = (error: unknown): string => {
  if (error instanceof TraccarError) {
    return error.message;
  }
  return "Unexpected error while syncing with Traccar";
};

/**
 * Throws TrackerConflictError if the tracker ID belongs to a different bus.
 * Call before creating/updating a bus so a conflict never leaves a half-saved bus.
 */
export const assertTrackerAvailable = async (
  trackerId: string,
  currentBusId?: Types.ObjectId
): Promise<void> => {
  const clash = await GpsDevice.findOne({
    traccarUniqueId: trackerId,
    ...(currentBusId ? { busId: { $ne: currentBusId } } : {})
  })
    .select("_id")
    .lean();

  if (clash) {
    throw new TrackerConflictError();
  }
};

const pushToTraccar = async (device: IGpsDevice, bus: BusRef): Promise<void> => {
  try {
    const name = deviceName(bus);
    const disabled = !device.isActive;
    let traccarId = device.traccarDeviceId;

    if (traccarId !== undefined) {
      const current = await getTraccarDevice(traccarId);
      if (current) {
        await updateTraccarDevice(current, {
          name,
          uniqueId: device.traccarUniqueId,
          disabled
        });
      } else {
        // Device was removed from Traccar manually: recreate it.
        traccarId = undefined;
      }
    }

    if (traccarId === undefined) {
      const created = await ensureTraccarDevice({ name, uniqueId: device.traccarUniqueId });
      if (disabled && !created.disabled) {
        await setTraccarDeviceDisabled(created.id, true);
      }
      traccarId = created.id;
    }

    device.traccarDeviceId = traccarId;
    device.syncStatus = "synced";
    device.syncError = undefined;
    device.syncedAt = new Date();
  } catch (error) {
    device.syncStatus = "failed";
    device.syncError = safeErrorMessage(error);
    if (!(error instanceof TraccarError)) {
      console.error("[busTracker] unexpected sync error:", error);
    } else if (error.kind !== "not_configured") {
      console.warn(`[busTracker] Traccar sync failed (${error.kind}): ${error.message}`);
    }
  }
  await device.save();
};

/**
 * Creates / updates / removes the tracker for a bus and syncs it to Traccar.
 *
 * - trackerId undefined: keep the current tracker; just re-sync if the bus status changed.
 * - trackerId null: detach the tracker (device is deactivated and disabled in Traccar).
 * - trackerId string: assign (or change) the tracker.
 *
 * Never throws for Traccar problems: the bus must still save. The outcome is reported in
 * the returned view (status "failed" + error). Throws TrackerConflictError on conflicts.
 */
export const syncBusTracker = async (params: {
  organizationId: string;
  bus: BusRef;
  trackerId: string | null | undefined;
}): Promise<BusTrackerView> => {
  const { organizationId, bus, trackerId } = params;
  const orgObjectId = new Types.ObjectId(organizationId);

  const existing = await GpsDevice.findOne({ organizationId: orgObjectId, busId: bus._id });

  const featureEnabled = await isOrgFeatureEnabled(organizationId, "gpsTracking");
  if (featureEnabled !== true) {
    // GPS tracking is not part of this organisation's plan: do not touch Traccar.
    return trackerId === undefined ? toTrackerView(existing) : { ...noTracker, status: "disabled" };
  }

  if (trackerId === null) {
    if (!existing || !existing.isActive) {
      return toTrackerView(existing);
    }
    existing.isActive = false;
    existing.syncStatus = "pending";
    existing.syncError = undefined;
    await pushToTraccar(existing, bus);
    return toTrackerView(existing);
  }

  if (trackerId === undefined) {
    if (!existing) {
      return noTracker;
    }
    const shouldBeActive = bus.status === "active";
    if (existing.isActive === shouldBeActive && existing.syncStatus === "synced") {
      return toTrackerView(existing);
    }
    existing.isActive = shouldBeActive;
    existing.syncStatus = "pending";
    await pushToTraccar(existing, bus);
    return toTrackerView(existing);
  }

  await assertTrackerAvailable(trackerId, bus._id);

  const device =
    existing ??
    new GpsDevice({
      organizationId: orgObjectId,
      busId: bus._id,
      traccarUniqueId: trackerId,
      name: deviceName(bus)
    });

  const changed = existing !== null && existing.traccarUniqueId !== trackerId;
  device.traccarUniqueId = trackerId;
  device.name = deviceName(bus);
  device.isActive = bus.status === "active";
  device.syncStatus = "pending";
  device.syncError = undefined;
  if (changed) {
    // Keep the Traccar id: the same Traccar device is renamed to the new identifier.
    device.lastSeen = undefined;
  }

  await claimTracker(device);
  await pushToTraccar(device, bus);
  return toTrackerView(device);
};

/** Retries the Traccar sync for a bus whose tracker is "pending" or "failed". */
export const retryBusTrackerSync = async (
  organizationId: string,
  bus: BusRef
): Promise<BusTrackerView> => {
  const device = await GpsDevice.findOne({
    organizationId: new Types.ObjectId(organizationId),
    busId: bus._id
  });
  if (!device) {
    return noTracker;
  }
  device.isActive = device.isActive && bus.status === "active";
  device.syncStatus = "pending";
  await pushToTraccar(device, bus);
  return toTrackerView(device);
};
