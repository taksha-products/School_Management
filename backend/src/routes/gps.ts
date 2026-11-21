import { Router, type NextFunction, type Response } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import { canAccessOrg, isOrgAdmin } from "../middleware/roleCheck";
import { requireTraccarWebhookSecret } from "../middleware/traccarWebhookAuth";
import { Bus } from "../models/Bus";
import { GpsDevice } from "../models/GpsDevice";
import { GpsLog } from "../models/GpsLog";
import { publishGpsPositionUpdate } from "../services/gpsPubSub";
import { ingestPosition, MAX_FUTURE_SKEW_MS } from "../services/positionIngest";
import type { BusTrail, LiveBusPosition, LiveBusRow, LiveBusStatus, TrailPoint } from "../types/gps";
import { parseTraccarPositionForwarderPayload } from "../types/gps";
import { asyncHandler } from "../utils/asyncHandler";
import { getCached, orgCacheKey, setCached } from "../utils/cache";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { thinTrail } from "../utils/trail";
import { paginate, parsePaginationQuery } from "../utils/paginate";

const LIVE_POSITIONS_TTL_SECONDS = 10;
/** A bus with no position update for this long is considered offline. */
const OFFLINE_AFTER_MS = 2 * 60 * 1000;
/** Above this speed (km/h) a bus counts as moving. */
const MOVING_SPEED_KMH = 1;

const TRAIL_DEFAULT_MINUTES = 30;
const TRAIL_MIN_MINUTES = 5;
const TRAIL_MAX_MINUTES = 120;
/** Upper bound on log rows read per request, to protect the database. */
const TRAIL_MAX_LOG_ROWS = 8_000;
const scopeMiddleware = [auth, orgScope, requireOrgScope, canAccessOrg] as const;

const requireOrgAdminOrSuper = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role === "superAdmin") {
    next();
    return;
  }
  isOrgAdmin(req, res, next);
};

export const traccarWebhookRouter = Router();

/** Log an ignored position for a device at most once per interval, so one stray tracker cannot flood the log. */
const IGNORED_LOG_INTERVAL_MS = 10 * 60 * 1000;
const IGNORED_LOG_MAX_DEVICES = 1_000;
const lastIgnoredLog = new Map<number, number>();

const shouldLogIgnored = (traccarDeviceId: number, now: number): boolean => {
  const last = lastIgnoredLog.get(traccarDeviceId);
  if (last !== undefined && now - last < IGNORED_LOG_INTERVAL_MS) {
    return false;
  }
  if (lastIgnoredLog.size >= IGNORED_LOG_MAX_DEVICES) {
    lastIgnoredLog.clear();
  }
  lastIgnoredLog.set(traccarDeviceId, now);
  return true;
};

traccarWebhookRouter.post(
  "/webhook/traccar",
  requireTraccarWebhookSecret,
  asyncHandler(async (req, res) => {
    const body: unknown = req.body;

    // Always answer 200 once the secret is verified: the forwarder must not retry positions we
    // deliberately ignore (no fix, unknown device, glitches), and a failure here must not break it.
    try {
      const position = parseTraccarPositionForwarderPayload(body);
      if (!position) {
        // eslint-disable-next-line no-console
        console.warn("Traccar webhook: unrecognised payload shape");
        res.status(200).json({ success: true });
        return;
      }

      const outcome = await ingestPosition(position, body);

      if (
        outcome.status === "ignored" &&
        outcome.reason !== "no GPS fix" &&
        shouldLogIgnored(position.deviceId, Date.now())
      ) {
        // eslint-disable-next-line no-console
        console.warn("Traccar webhook: position ignored", {
          traccarDeviceId: position.deviceId,
          reason: outcome.reason
        });
      }

      if (outcome.status === "updated") {
        await publishGpsPositionUpdate(outcome.organizationId, {
          type: "position_update",
          deviceId: outcome.deviceId,
          busId: outcome.busId,
          organizationId: outcome.organizationId,
          lat: outcome.position.lat,
          lng: outcome.position.lng,
          speed: outcome.position.speedKmh,
          bearing: outcome.position.bearing,
          accuracy: outcome.position.accuracy ?? 0,
          timestamp: outcome.position.eventTime.toISOString()
        });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error("Traccar webhook processing error:", message);
    }

    res.status(200).json({ success: true });
  })
);

export const gpsRouter = Router();

const requireStaffLevelAccess = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const role = req.user?.role;
  if (role === "superAdmin" || role === "orgAdmin" || role === "staff") {
    next();
    return;
  }
  res.status(403).json({
    success: false,
    data: null,
    message: "Forbidden: live tracking of all buses is restricted to school staff"
  });
};

const deriveTrackingStatus = (row: LiveBusRow, now: number): LiveBusStatus => {
  if (!row.deviceId) {
    return "no_device";
  }
  if (!row.lastSeen) {
    return "offline";
  }
  const age = now - new Date(row.lastSeen).getTime();
  // A last position far in the future (device clock was wrong) is not a live signal.
  if (Number.isNaN(age) || age > OFFLINE_AFTER_MS || age < -MAX_FUTURE_SKEW_MS) {
    return "offline";
  }
  return (row.speed ?? 0) > MOVING_SPEED_KMH ? "live" : "stopped";
};

gpsRouter.get(
  "/buses/live",
  ...scopeMiddleware,
  requireStaffLevelAccess,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const cacheKey = orgCacheKey(orgId, "live_positions");

    let rows = await getCached<LiveBusRow[]>(cacheKey);

    if (!rows) {
      const filter = orgFilter(authReq, res);
      const [buses, devices] = await Promise.all([
        Bus.find({ ...filter, status: "active" })
          .select("busNumber routeName routeNumber")
          .sort({ busNumber: 1 })
          .lean(),
        GpsDevice.find({ ...filter, isActive: true }).lean()
      ]);

      const deviceByBus = new Map(devices.map((device) => [String(device.busId), device]));

      rows = buses.map((bus): LiveBusRow => {
        const device = deviceByBus.get(String(bus._id));
        return {
          busId: String(bus._id),
          busNumber: bus.busNumber,
          routeName: bus.routeName,
          routeNumber: bus.routeNumber?.trim() || null,
          deviceId: device ? String(device._id) : null,
          lat: device?.lastLat ?? null,
          lng: device?.lastLng ?? null,
          speed: device?.lastSpeed ?? null,
          bearing: device?.lastBearing ?? null,
          lastSeen: device?.lastSeen ? device.lastSeen.toISOString() : null,
          batteryLevel: device?.batteryLevel ?? null
        };
      });

      await setCached(cacheKey, rows, LIVE_POSITIONS_TTL_SECONDS);
    }

    // Status depends on "now", so it is derived on every request, not cached.
    const now = Date.now();
    const data: LiveBusPosition[] = rows.map((row) => ({
      ...row,
      status: deriveTrackingStatus(row, now)
    }));

    res.json({
      success: true,
      data,
      message: "Live bus positions fetched successfully"
    });
  })
);

gpsRouter.get(
  "/buses/trails",
  ...scopeMiddleware,
  requireStaffLevelAccess,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;

    const requested = Number(req.query.minutes);
    const minutes = Number.isFinite(requested)
      ? Math.min(TRAIL_MAX_MINUTES, Math.max(TRAIL_MIN_MINUTES, Math.round(requested)))
      : TRAIL_DEFAULT_MINUTES;
    const since = new Date(Date.now() - minutes * 60_000);

    // Newest first so the row cap trims the oldest points, then reversed per bus below.
    const logs = await GpsLog.find({
      ...orgFilter(authReq, res),
      traccarEventTime: { $gte: since }
    })
      .sort({ traccarEventTime: -1 })
      .limit(TRAIL_MAX_LOG_ROWS)
      .select("busId lat lng traccarEventTime")
      .lean();

    const byBus = new Map<string, TrailPoint[]>();
    for (const log of logs) {
      const key = String(log.busId);
      const list = byBus.get(key) ?? [];
      list.push([log.lat, log.lng, log.traccarEventTime.getTime()]);
      byBus.set(key, list);
    }

    const data: BusTrail[] = [];
    for (const [busId, newestFirst] of byBus) {
      const chronological = newestFirst.reverse();
      data.push({ busId, points: thinTrail(chronological) });
    }

    res.json({
      success: true,
      data,
      message: "Bus trails fetched successfully"
    });
  })
);

gpsRouter.get(
  "/devices",
  ...scopeMiddleware,
  requireOrgAdminOrSuper,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { page, limit } = parsePaginationQuery(req.query, 20);
    const { data, pagination } = await paginate(GpsDevice, orgFilter(authReq, res), {
      page,
      limit,
      sort: { createdAt: -1 },
      populate: { path: "busId", select: "busNumber routeName" }
    });

    res.json({
      success: true,
      data,
      pagination,
      message: "GPS devices fetched successfully"
    });
  })
);

gpsRouter.post(
  "/devices",
  ...scopeMiddleware,
  requireOrgAdminOrSuper,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { busId, traccarDeviceId, traccarUniqueId, name } = req.body as {
      busId?: string;
      traccarDeviceId?: number;
      traccarUniqueId?: string;
      name?: string;
    };

    if (!busId || traccarDeviceId === undefined || !traccarUniqueId || !name) {
      res.status(400).json({
        success: false,
        data: null,
        message: "busId, traccarDeviceId, traccarUniqueId, and name are required"
      });
      return;
    }

    const bus = await Bus.findOne({ _id: busId, ...orgFilter(authReq, res) });
    if (!bus) {
      res.status(404).json({ success: false, data: null, message: "Bus not found in organization" });
      return;
    }

    const existingForBus = await GpsDevice.findOne({
      organizationId: new Types.ObjectId(orgId),
      busId: new Types.ObjectId(busId),
      isActive: true
    });
    if (existingForBus) {
      res.status(400).json({
        success: false,
        data: null,
        message: "This bus already has an active GPS device assigned"
      });
      return;
    }

    const device = await GpsDevice.create({
      organizationId: orgId,
      busId,
      traccarDeviceId,
      traccarUniqueId,
      name
    });

    const populated = await GpsDevice.findById(device._id).populate("busId", "busNumber routeName");

    res.status(201).json({
      success: true,
      data: populated,
      message: "GPS device registered successfully"
    });
  })
);

gpsRouter.patch(
  "/devices/:id",
  ...scopeMiddleware,
  requireOrgAdminOrSuper,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const { name, isActive } = req.body as { name?: string; isActive?: boolean };

    const device = await GpsDevice.findOne({
      _id: String(req.params.id),
      ...orgFilter(authReq, res)
    });

    if (!device) {
      res.status(404).json({ success: false, data: null, message: "GPS device not found" });
      return;
    }

    if (name !== undefined) {
      device.name = name;
    }
    if (isActive !== undefined) {
      device.isActive = isActive;
    }

    await device.save();
    const populated = await GpsDevice.findById(device._id).populate("busId", "busNumber routeName");

    res.json({
      success: true,
      data: populated,
      message: "GPS device updated successfully"
    });
  })
);

gpsRouter.delete(
  "/devices/:id",
  ...scopeMiddleware,
  requireOrgAdminOrSuper,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;

    const device = await GpsDevice.findOne({
      _id: String(req.params.id),
      ...orgFilter(authReq, res)
    });

    if (!device) {
      res.status(404).json({ success: false, data: null, message: "GPS device not found" });
      return;
    }

    device.isActive = false;
    await device.save();

    res.json({
      success: true,
      data: device,
      message: "GPS device deactivated successfully"
    });
  })
);
