import { Router, type NextFunction, type Response } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import { canAccessOrg, isOrgAdmin } from "../middleware/roleCheck";
import { Bus } from "../models/Bus";
import { GpsDevice } from "../models/GpsDevice";
import { GpsLog } from "../models/GpsLog";
import { publishGpsPositionUpdate } from "../services/gpsPubSub";
import type { LiveBusPosition } from "../types/gps";
import {
  knotsToKmh,
  parseTraccarPositionForwarderPayload,
  resolveTraccarEventTime
} from "../types/gps";
import { asyncHandler } from "../utils/asyncHandler";
import { getCached, orgCacheKey, setCached } from "../utils/cache";
import { getScopedOrganizationId, orgFilter } from "../utils/orgFilter";
import { paginate, parsePaginationQuery } from "../utils/paginate";

const LIVE_POSITIONS_TTL_SECONDS = 10;

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

traccarWebhookRouter.post(
  "/webhook/traccar",
  asyncHandler(async (req, res) => {
    const body: unknown = req.body;
    // eslint-disable-next-line no-console
    console.log("Traccar webhook received:", JSON.stringify(body).slice(0, 200));

    try {
      const position = parseTraccarPositionForwarderPayload(body);

      if (!position) {
        // eslint-disable-next-line no-console
        console.warn("Traccar webhook: unrecognised payload shape");
        res.status(200).json({ success: true });
        return;
      }

      if (position.valid !== true) {
        res.status(200).json({ success: true });
        return;
      }

      const device = await GpsDevice.findOne({ traccarDeviceId: position.deviceId });
      if (!device) {
        // eslint-disable-next-line no-console
        console.warn("Traccar webhook: unknown device", {
          traccarDeviceId: position.deviceId
        });
        res.status(200).json({ success: true });
        return;
      }

      const speedKmh = knotsToKmh(position.speed);
      const bearing = position.course;
      const accuracy = position.accuracy ?? 0;
      const batteryLevel =
        position.attributes?.batteryLevel !== undefined
          ? position.attributes.batteryLevel
          : device.batteryLevel;
      const satellites = position.attributes?.satellites;
      const eventTime = resolveTraccarEventTime(position);

      await GpsLog.create({
        organizationId: device.organizationId,
        deviceId: device._id,
        busId: device.busId,
        lat: position.latitude,
        lng: position.longitude,
        speed: speedKmh,
        bearing,
        accuracy: position.accuracy,
        altitude: position.altitude,
        satellites,
        traccarEventTime: eventTime,
        rawPayload: body
      });

      device.lastSeen = eventTime;
      device.lastLat = position.latitude;
      device.lastLng = position.longitude;
      device.lastSpeed = speedKmh;
      device.lastBearing = bearing;
      device.lastAccuracy = position.accuracy;
      if (batteryLevel !== undefined && !Number.isNaN(batteryLevel)) {
        device.batteryLevel = Math.min(100, Math.max(0, batteryLevel));
      }
      await device.save();

      const orgId = device.organizationId.toString();
      await publishGpsPositionUpdate(orgId, {
        type: "position_update",
        deviceId: device._id.toString(),
        busId: device.busId.toString(),
        organizationId: orgId,
        lat: position.latitude,
        lng: position.longitude,
        speed: speedKmh,
        bearing,
        accuracy,
        timestamp: eventTime.toISOString()
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error("Traccar webhook processing error:", message);
    }

    res.status(200).json({ success: true });
  })
);

export const gpsRouter = Router();

gpsRouter.get(
  "/buses/live",
  ...scopeMiddleware,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const cacheKey = orgCacheKey(orgId, "live_positions");

    const cached = await getCached<LiveBusPosition[]>(cacheKey);
    if (cached) {
      res.json({
        success: true,
        data: cached,
        message: "Live bus positions fetched successfully"
      });
      return;
    }

    const devices = await GpsDevice.find({
      ...orgFilter(authReq, res),
      isActive: true
    }).populate<{ busId: { busNumber: string; routeName: string } | null }>("busId", "busNumber routeName");

    const data: LiveBusPosition[] = devices.map((device) => {
      const bus =
        device.busId && typeof device.busId === "object" && "busNumber" in device.busId
          ? device.busId
          : null;

      return {
        busId: device.busId instanceof Types.ObjectId ? device.busId.toString() : String(device.busId),
        busNumber: bus?.busNumber ?? "—",
        routeName: bus?.routeName ?? "—",
        deviceId: device._id.toString(),
        lat: device.lastLat ?? null,
        lng: device.lastLng ?? null,
        speed: device.lastSpeed ?? null,
        bearing: device.lastBearing ?? null,
        lastSeen: device.lastSeen ? device.lastSeen.toISOString() : null,
        batteryLevel: device.batteryLevel ?? null
      };
    });

    await setCached(cacheKey, data, LIVE_POSITIONS_TTL_SECONDS);

    res.json({
      success: true,
      data,
      message: "Live bus positions fetched successfully"
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
