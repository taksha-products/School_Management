import { GpsDevice } from "../models/GpsDevice";
import { GpsLog } from "../models/GpsLog";
import {
  knotsToKmh,
  resolveTraccarEventTime,
  type TraccarPositionForwarderPayload
} from "../types/gps";

/** A device clock this far ahead of the server is treated as wrong; server time is used instead. */
export const MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;
/** Anything faster is a glitch for a road vehicle (km/h). */
export const MAX_SPEED_KMH = 250;
/** Positions within this distance of (0,0) are the classic "no fix" value, never a real bus. */
const NULL_ISLAND_EPSILON = 1e-5;

export interface CleanPosition {
  lat: number;
  lng: number;
  speedKmh: number;
  bearing: number;
  accuracy: number | undefined;
  altitude: number | undefined;
  satellites: number | undefined;
  /** 0-100, or undefined when the device did not report a usable battery level. */
  battery: number | undefined;
  eventTime: Date;
  /** True when the device timestamp was in the future and server time was used. */
  clockAhead: boolean;
}

export type CleanResult = { ok: true; value: CleanPosition } | { ok: false; reason: string };

const finiteOrUndefined = (value: number | undefined): number | undefined =>
  value !== undefined && Number.isFinite(value) ? value : undefined;

/**
 * Validates and normalises a Traccar position. Pure function (no I/O) so every rule can be
 * unit-tested. Rejected positions are never stored.
 */
export const cleanPosition = (
  position: TraccarPositionForwarderPayload,
  now: number = Date.now()
): CleanResult => {
  const { latitude: lat, longitude: lng } = position;

  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, reason: "coordinates are not numbers" };
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return { ok: false, reason: "coordinates out of range" };
  }
  if (Math.abs(lat) < NULL_ISLAND_EPSILON && Math.abs(lng) < NULL_ISLAND_EPSILON) {
    return { ok: false, reason: "coordinates are (0,0), a no-fix value" };
  }

  const speedKmh = knotsToKmh(position.speed);
  if (!Number.isFinite(speedKmh) || speedKmh < 0 || speedKmh > MAX_SPEED_KMH) {
    return { ok: false, reason: "implausible speed" };
  }

  const reportedTime = resolveTraccarEventTime(position);
  const clockAhead = reportedTime.getTime() > now + MAX_FUTURE_SKEW_MS;
  const eventTime = clockAhead ? new Date(now) : reportedTime;

  const course = Number.isFinite(position.course) ? position.course : 0;
  const bearing = ((course % 360) + 360) % 360;

  const accuracy = finiteOrUndefined(position.accuracy);
  const battery = finiteOrUndefined(position.attributes?.batteryLevel);

  return {
    ok: true,
    value: {
      lat,
      lng,
      speedKmh,
      bearing,
      accuracy: accuracy !== undefined && accuracy >= 0 ? accuracy : undefined,
      altitude: finiteOrUndefined(position.altitude),
      satellites: finiteOrUndefined(position.attributes?.satellites),
      battery: battery !== undefined ? Math.min(100, Math.max(0, battery)) : undefined,
      eventTime,
      clockAhead
    }
  };
};

export type IngestOutcome =
  /** Not stored: validation failed or the device is unknown / inactive. */
  | { status: "ignored"; reason: string }
  /** Same device and timestamp already stored (device resend). */
  | { status: "duplicate" }
  /** Stored in the history, but a newer position already exists, so the live position is unchanged. */
  | { status: "history_only" }
  /** Stored and now the live position. */
  | {
      status: "updated";
      organizationId: string;
      busId: string;
      deviceId: string;
      position: CleanPosition;
    };

/** Raw Traccar payloads are bulky; keep them only when explicitly enabled (debugging). */
const shouldStoreRawPayload = (): boolean => process.env.GPS_STORE_RAW_PAYLOAD === "true";

/**
 * Stores a position and moves the device's live position, atomically:
 * - duplicates (same device + timestamp) are accepted but not stored twice;
 * - an older position (e.g. a tracker sending its backlog) goes to the history only and
 *   never overwrites a newer live position, even when requests are processed concurrently.
 */
export const ingestPosition = async (
  position: TraccarPositionForwarderPayload,
  rawBody: unknown,
  now: number = Date.now()
): Promise<IngestOutcome> => {
  if (position.valid !== true) {
    return { status: "ignored", reason: "no GPS fix" };
  }

  const cleaned = cleanPosition(position, now);
  if (!cleaned.ok) {
    return { status: "ignored", reason: cleaned.reason };
  }
  const clean = cleaned.value;

  const device = await GpsDevice.findOne({
    traccarDeviceId: position.deviceId,
    isActive: true
  })
    .select("organizationId busId")
    .lean();
  if (!device) {
    return { status: "ignored", reason: "unknown or inactive device" };
  }

  const stored = await GpsLog.updateOne(
    { deviceId: device._id, traccarEventTime: clean.eventTime },
    {
      $setOnInsert: {
        organizationId: device.organizationId,
        busId: device.busId,
        lat: clean.lat,
        lng: clean.lng,
        speed: clean.speedKmh,
        bearing: clean.bearing,
        accuracy: clean.accuracy,
        altitude: clean.altitude,
        satellites: clean.satellites,
        receivedAt: new Date(now),
        ...(shouldStoreRawPayload() ? { rawPayload: rawBody } : {})
      }
    },
    { upsert: true }
  );
  if (stored.upsertedCount === 0) {
    return { status: "duplicate" };
  }

  // Only a strictly newer position may become the live position.
  const moved = await GpsDevice.updateOne(
    {
      _id: device._id,
      $or: [{ lastSeen: { $exists: false } }, { lastSeen: null }, { lastSeen: { $lt: clean.eventTime } }]
    },
    {
      $set: {
        lastSeen: clean.eventTime,
        lastLat: clean.lat,
        lastLng: clean.lng,
        lastSpeed: clean.speedKmh,
        lastBearing: clean.bearing,
        ...(clean.accuracy !== undefined ? { lastAccuracy: clean.accuracy } : {}),
        ...(clean.battery !== undefined ? { batteryLevel: clean.battery } : {})
      }
    }
  );
  if (moved.modifiedCount === 0) {
    return { status: "history_only" };
  }

  return {
    status: "updated",
    organizationId: device.organizationId.toString(),
    busId: device.busId.toString(),
    deviceId: device._id.toString(),
    position: clean
  };
};
