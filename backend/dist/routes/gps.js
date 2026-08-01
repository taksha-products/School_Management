"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.gpsRouter = exports.traccarWebhookRouter = void 0;
const express_1 = require("express");
const mongoose_1 = require("mongoose");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const Bus_1 = require("../models/Bus");
const GpsDevice_1 = require("../models/GpsDevice");
const GpsLog_1 = require("../models/GpsLog");
const gpsPubSub_1 = require("../services/gpsPubSub");
const gps_1 = require("../types/gps");
const asyncHandler_1 = require("../utils/asyncHandler");
const cache_1 = require("../utils/cache");
const orgFilter_1 = require("../utils/orgFilter");
const paginate_1 = require("../utils/paginate");
const LIVE_POSITIONS_TTL_SECONDS = 10;
const scopeMiddleware = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg];
const requireOrgAdminOrSuper = (req, res, next) => {
    if (req.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, roleCheck_1.isOrgAdmin)(req, res, next);
};
exports.traccarWebhookRouter = (0, express_1.Router)();
exports.traccarWebhookRouter.post("/webhook/traccar", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const body = req.body;
    // eslint-disable-next-line no-console
    console.log("Traccar webhook received:", JSON.stringify(body).slice(0, 200));
    try {
        const position = (0, gps_1.parseTraccarPositionForwarderPayload)(body);
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
        const device = await GpsDevice_1.GpsDevice.findOne({ traccarDeviceId: position.deviceId });
        if (!device) {
            // eslint-disable-next-line no-console
            console.warn("Traccar webhook: unknown device", {
                traccarDeviceId: position.deviceId
            });
            res.status(200).json({ success: true });
            return;
        }
        const speedKmh = (0, gps_1.knotsToKmh)(position.speed);
        const bearing = position.course;
        const accuracy = position.accuracy ?? 0;
        const batteryLevel = position.attributes?.batteryLevel !== undefined
            ? position.attributes.batteryLevel
            : device.batteryLevel;
        const satellites = position.attributes?.satellites;
        const eventTime = (0, gps_1.resolveTraccarEventTime)(position);
        await GpsLog_1.GpsLog.create({
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
        await (0, gpsPubSub_1.publishGpsPositionUpdate)(orgId, {
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
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error("Traccar webhook processing error:", message);
    }
    res.status(200).json({ success: true });
}));
exports.gpsRouter = (0, express_1.Router)();
exports.gpsRouter.get("/buses/live", ...scopeMiddleware, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const cacheKey = (0, cache_1.orgCacheKey)(orgId, "live_positions");
    const cached = await (0, cache_1.getCached)(cacheKey);
    if (cached) {
        res.json({
            success: true,
            data: cached,
            message: "Live bus positions fetched successfully"
        });
        return;
    }
    const devices = await GpsDevice_1.GpsDevice.find({
        ...(0, orgFilter_1.orgFilter)(authReq, res),
        isActive: true
    }).populate("busId", "busNumber routeName");
    const data = devices.map((device) => {
        const bus = device.busId && typeof device.busId === "object" && "busNumber" in device.busId
            ? device.busId
            : null;
        return {
            busId: device.busId instanceof mongoose_1.Types.ObjectId ? device.busId.toString() : String(device.busId),
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
    await (0, cache_1.setCached)(cacheKey, data, LIVE_POSITIONS_TTL_SECONDS);
    res.json({
        success: true,
        data,
        message: "Live bus positions fetched successfully"
    });
}));
exports.gpsRouter.get("/devices", ...scopeMiddleware, requireOrgAdminOrSuper, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { page, limit } = (0, paginate_1.parsePaginationQuery)(req.query, 20);
    const { data, pagination } = await (0, paginate_1.paginate)(GpsDevice_1.GpsDevice, (0, orgFilter_1.orgFilter)(authReq, res), {
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
}));
exports.gpsRouter.post("/devices", ...scopeMiddleware, requireOrgAdminOrSuper, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { busId, traccarDeviceId, traccarUniqueId, name } = req.body;
    if (!busId || traccarDeviceId === undefined || !traccarUniqueId || !name) {
        res.status(400).json({
            success: false,
            data: null,
            message: "busId, traccarDeviceId, traccarUniqueId, and name are required"
        });
        return;
    }
    const bus = await Bus_1.Bus.findOne({ _id: busId, ...(0, orgFilter_1.orgFilter)(authReq, res) });
    if (!bus) {
        res.status(404).json({ success: false, data: null, message: "Bus not found in organization" });
        return;
    }
    const existingForBus = await GpsDevice_1.GpsDevice.findOne({
        organizationId: new mongoose_1.Types.ObjectId(orgId),
        busId: new mongoose_1.Types.ObjectId(busId),
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
    const device = await GpsDevice_1.GpsDevice.create({
        organizationId: orgId,
        busId,
        traccarDeviceId,
        traccarUniqueId,
        name
    });
    const populated = await GpsDevice_1.GpsDevice.findById(device._id).populate("busId", "busNumber routeName");
    res.status(201).json({
        success: true,
        data: populated,
        message: "GPS device registered successfully"
    });
}));
exports.gpsRouter.patch("/devices/:id", ...scopeMiddleware, requireOrgAdminOrSuper, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const { name, isActive } = req.body;
    const device = await GpsDevice_1.GpsDevice.findOne({
        _id: String(req.params.id),
        ...(0, orgFilter_1.orgFilter)(authReq, res)
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
    const populated = await GpsDevice_1.GpsDevice.findById(device._id).populate("busId", "busNumber routeName");
    res.json({
        success: true,
        data: populated,
        message: "GPS device updated successfully"
    });
}));
exports.gpsRouter.delete("/devices/:id", ...scopeMiddleware, requireOrgAdminOrSuper, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const device = await GpsDevice_1.GpsDevice.findOne({
        _id: String(req.params.id),
        ...(0, orgFilter_1.orgFilter)(authReq, res)
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
}));
