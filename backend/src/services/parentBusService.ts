import { Types } from "mongoose";

import { Bus } from "../models/Bus";
import { GpsDevice } from "../models/GpsDevice";
import { GpsLog } from "../models/GpsLog";
import { Student } from "../models/Student";
import { StudentTransport } from "../models/StudentTransport";
import { User } from "../models/User";
import type { TrailPoint } from "../types/gps";
import { getCached, orgCacheKey, setCached } from "../utils/cache";
import { thinTrail } from "../utils/trail";
import { MAX_FUTURE_SKEW_MS } from "./positionIngest";

/**
 * A parent only sees the bus while it is running: its last position must be this recent.
 * After the route ends the location is hidden (state "not_running").
 */
export const PARENT_VISIBLE_WINDOW_MS = 5 * 60 * 1000;
/** Above this speed (km/h) a running bus counts as moving. */
const MOVING_SPEED_KMH = 1;

export const PARENT_TRAIL_MINUTES = 15;
const PARENT_TRAIL_MAX_POINTS = 100;
const PARENT_TRAIL_MAX_LOG_ROWS = 1_500;

const BUS_CACHE_TTL_SECONDS = 5;
/** How far back to look for the last time a stopped bus was moving. */
const STOPPED_LOOKBACK_MINUTES = 60;

export type ParentBusState =
  /** The child has no current bus (or the bus is inactive). */
  | "no_bus"
  /** The child has a bus but it has no GPS tracker / no position yet. */
  | "tracking_unavailable"
  /** The bus has a tracker but is not running right now: location is hidden. */
  | "not_running"
  | "running";

export interface ChildStops {
  pickup: string | null;
  drop: string | null;
}

export interface ParentBusPosition {
  lat: number;
  lng: number;
  speed: number;
  bearing: number;
  lastSeen: string;
  status: "live" | "stopped";
  /**
   * For a stopped bus: when it was last moving (so the app can say "stopped for 4 min").
   * Null when moving, or when it has not moved within the last hour.
   */
  stoppedSince: string | null;
}

/**
 * Everything a parent may learn about their child's bus. Deliberately minimal:
 * no device / tracker IDs, no battery, no driver phone number, no other buses.
 */
export interface ParentBusView {
  state: ParentBusState;
  studentName: string;
  /** The child's own pickup and drop stops (plain text set by the school). */
  stops: ChildStops | null;
  bus: {
    busId: string;
    busNumber: string;
    routeName: string;
    routeNumber: string | null;
    driverName: string;
  } | null;
  position: ParentBusPosition | null;
}

export interface OwnedChild {
  id: string;
  name: string;
}

/**
 * Verifies against the database (not the possibly stale token) that this parent account
 * is linked to the student and that the student is still active in the organisation.
 * One round trip: the two checks run in parallel and the student's name comes back with them.
 */
export const resolveOwnedChild = async (params: {
  organizationId: string;
  parentUserId: string;
  studentId: string;
}): Promise<OwnedChild | null> => {
  const { organizationId, parentUserId, studentId } = params;
  if (!Types.ObjectId.isValid(studentId) || !Types.ObjectId.isValid(parentUserId)) {
    return null;
  }

  const orgObjectId = new Types.ObjectId(organizationId);
  const studentObjectId = new Types.ObjectId(studentId);

  const [parent, student] = await Promise.all([
    User.exists({
      _id: new Types.ObjectId(parentUserId),
      organizationId: orgObjectId,
      role: "parent",
      isActive: true,
      parentStudentIds: studentObjectId
    }),
    Student.findOne({ _id: studentObjectId, organizationId: orgObjectId, status: "active" })
      .select("name")
      .lean()
  ]);

  return parent !== null && student !== null ? { id: studentId, name: student.name } : null;
};

interface ChildBus {
  busId: string;
  busNumber: string;
  routeName: string;
  routeNumber: string | null;
  driverName: string;
  stops: ChildStops;
}

/** Short cache so a parent polling every 10 s does not query the database for it each time. */
const CHILD_BUS_CACHE_TTL_SECONDS = 15;

/** The bus a student currently rides, or null (no active transport record / inactive bus). */
const findCurrentBus = async (
  organizationId: string,
  studentId: string
): Promise<ChildBus | null> => {
  const cacheKey = orgCacheKey(organizationId, `child_bus:${studentId}`);
  const cached = await getCached<{ bus: ChildBus | null }>(cacheKey);
  if (cached) {
    return cached.bus;
  }

  const orgObjectId = new Types.ObjectId(organizationId);
  const now = new Date();
  const transport = await StudentTransport.findOne({
    organizationId: orgObjectId,
    studentId: new Types.ObjectId(studentId),
    status: "active",
    effectiveFrom: { $lte: now },
    $or: [{ effectiveTo: null }, { effectiveTo: { $exists: false } }, { effectiveTo: { $gte: now } }]
  })
    .select("busId pickupStop dropStop")
    .lean();

  let result: ChildBus | null = null;
  if (transport) {
    const bus = await Bus.findOne({
      _id: transport.busId,
      organizationId: orgObjectId,
      status: "active"
    })
      .select("busNumber routeName routeNumber driverName")
      .lean();
    if (bus) {
      result = {
        busId: bus._id.toString(),
        busNumber: bus.busNumber,
        routeName: bus.routeName,
        routeNumber: bus.routeNumber?.trim() || null,
        driverName: bus.driverName,
        stops: {
          pickup: transport.pickupStop?.trim() || null,
          drop: transport.dropStop?.trim() || null
        }
      };
    }
  }

  await setCached(cacheKey, { bus: result }, CHILD_BUS_CACHE_TTL_SECONDS);
  return result;
};

interface CachedBusPosition {
  lastSeen: string | null;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  bearing: number | null;
  /** Last time the bus was seen moving; only looked up while it is stopped. */
  lastMovingAt: string | null;
  hasDevice: boolean;
}

/** Last known position of a bus (cached for a few seconds so many parents cost one lookup). */
const loadBusPosition = async (
  organizationId: string,
  busId: Types.ObjectId
): Promise<CachedBusPosition> => {
  const cacheKey = orgCacheKey(organizationId, `parent_bus:${busId.toString()}`);
  const cached = await getCached<CachedBusPosition>(cacheKey);
  if (cached) {
    return cached;
  }

  const device = await GpsDevice.findOne({
    organizationId: new Types.ObjectId(organizationId),
    busId,
    isActive: true
  })
    .select("lastSeen lastLat lastLng lastSpeed lastBearing")
    .lean();

  const value: CachedBusPosition = {
    hasDevice: device !== null,
    lastSeen: device?.lastSeen ? device.lastSeen.toISOString() : null,
    lat: device?.lastLat ?? null,
    lng: device?.lastLng ?? null,
    speed: device?.lastSpeed ?? null,
    bearing: device?.lastBearing ?? null,
    lastMovingAt: null
  };

  // Only a stopped bus needs the extra lookup ("stopped for X min").
  if (device?.lastSeen && (device.lastSpeed ?? 0) <= MOVING_SPEED_KMH) {
    const lastMoving = await GpsLog.findOne({
      organizationId: new Types.ObjectId(organizationId),
      busId,
      speed: { $gt: MOVING_SPEED_KMH },
      traccarEventTime: { $gte: new Date(Date.now() - STOPPED_LOOKBACK_MINUTES * 60_000) }
    })
      .sort({ traccarEventTime: -1 })
      .select("traccarEventTime")
      .lean();
    value.lastMovingAt = lastMoving ? lastMoving.traccarEventTime.toISOString() : null;
  }

  await setCached(cacheKey, value, BUS_CACHE_TTL_SECONDS);
  return value;
};

const isRunning = (lastSeen: string | null, now: number): boolean => {
  if (!lastSeen) {
    return false;
  }
  const age = now - new Date(lastSeen).getTime();
  // A last position far in the future (device clock was wrong) is not a live signal.
  return !Number.isNaN(age) && age <= PARENT_VISIBLE_WINDOW_MS && age >= -MAX_FUTURE_SKEW_MS;
};

/**
 * The bus view for one child. The caller must already have verified that the parent owns
 * the student (see parentOwnsActiveStudent).
 */
export const getParentBusView = async (params: {
  organizationId: string;
  studentId: string;
  studentName: string;
}): Promise<ParentBusView> => {
  const { organizationId, studentId, studentName } = params;

  const child = await findCurrentBus(organizationId, studentId);
  if (!child) {
    return { state: "no_bus", studentName, stops: null, bus: null, position: null };
  }

  const { stops, ...bus } = child;

  const position = await loadBusPosition(organizationId, new Types.ObjectId(bus.busId));
  if (!position.hasDevice || position.lat === null || position.lng === null) {
    return { state: "tracking_unavailable", studentName, stops, bus, position: null };
  }

  if (!isRunning(position.lastSeen, Date.now())) {
    // Bus is known but not running: reveal nothing about where it is.
    return { state: "not_running", studentName, stops, bus, position: null };
  }

  const speed = position.speed ?? 0;
  const moving = speed > MOVING_SPEED_KMH;
  return {
    state: "running",
    studentName,
    stops,
    bus,
    position: {
      lat: position.lat,
      lng: position.lng,
      speed,
      bearing: position.bearing ?? 0,
      lastSeen: position.lastSeen as string,
      status: moving ? "live" : "stopped",
      stoppedSince: moving ? null : position.lastMovingAt
    }
  };
};

/** Coarse state of a bus for list views (dashboard chips). Reveals no location. */
export type BusLiveState = "live" | "stopped" | "not_running" | "no_tracker";

/**
 * Live state per bus, for a parent's children. Deduplicated by bus and served from the same
 * short cache as the full view, so a family with two children on one bus costs one lookup.
 */
export const getBusLiveStates = async (
  organizationId: string,
  busIds: string[]
): Promise<Map<string, BusLiveState>> => {
  const unique = [...new Set(busIds)].filter((id) => Types.ObjectId.isValid(id));
  const entries = await Promise.all(
    unique.map(async (busId): Promise<[string, BusLiveState]> => {
      const position = await loadBusPosition(organizationId, new Types.ObjectId(busId));
      if (!position.hasDevice || position.lat === null || position.lng === null) {
        return [busId, "no_tracker"];
      }
      if (!isRunning(position.lastSeen, Date.now())) {
        return [busId, "not_running"];
      }
      return [busId, (position.speed ?? 0) > MOVING_SPEED_KMH ? "live" : "stopped"];
    })
  );
  return new Map(entries);
};

/**
 * Recent track of the child's bus, only while the bus is running. Returns an empty list
 * otherwise, so history is never exposed for a bus that is not on its route.
 */
export const getParentBusTrail = async (params: {
  organizationId: string;
  busId: string;
}): Promise<TrailPoint[]> => {
  const { organizationId, busId } = params;
  const busObjectId = new Types.ObjectId(busId);

  const position = await loadBusPosition(organizationId, busObjectId);
  if (!isRunning(position.lastSeen, Date.now())) {
    return [];
  }

  const since = new Date(Date.now() - PARENT_TRAIL_MINUTES * 60_000);
  const logs = await GpsLog.find({
    organizationId: new Types.ObjectId(organizationId),
    busId: busObjectId,
    traccarEventTime: { $gte: since }
  })
    .sort({ traccarEventTime: -1 })
    .limit(PARENT_TRAIL_MAX_LOG_ROWS)
    .select("lat lng traccarEventTime")
    .lean();

  const chronological: TrailPoint[] = logs
    .reverse()
    .map((log): TrailPoint => [log.lat, log.lng, log.traccarEventTime.getTime()]);

  return thinTrail(chronological, PARENT_TRAIL_MAX_POINTS);
};
