"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveTraccarEventTime = exports.knotsToKmh = exports.parseTraccarWebhookPayload = exports.parseTraccarPositionForwarderPayload = void 0;
const isRecord = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const parseFiniteNumber = (value) => {
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === "string" && value.trim() !== "") {
        const parsed = Number(value);
        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }
    return undefined;
};
const parseAttributes = (value) => {
    if (!isRecord(value)) {
        return undefined;
    }
    const attributes = {};
    const satellites = parseFiniteNumber(value.satellites);
    if (satellites !== undefined) {
        attributes.satellites = satellites;
    }
    const batteryLevel = parseFiniteNumber(value.batteryLevel);
    if (batteryLevel !== undefined) {
        attributes.batteryLevel = batteryLevel;
    }
    const distance = parseFiniteNumber(value.distance);
    if (distance !== undefined) {
        attributes.distance = distance;
    }
    const totalDistance = parseFiniteNumber(value.totalDistance);
    if (totalDistance !== undefined) {
        attributes.totalDistance = totalDistance;
    }
    return Object.keys(attributes).length > 0 ? attributes : undefined;
};
const parseTraccarPositionForwarderPayload = (body) => {
    if (!isRecord(body)) {
        return null;
    }
    const deviceId = parseFiniteNumber(body.deviceId);
    const valid = body.valid;
    const latitude = parseFiniteNumber(body.latitude);
    const longitude = parseFiniteNumber(body.longitude);
    const speed = parseFiniteNumber(body.speed);
    const course = parseFiniteNumber(body.course);
    if (deviceId === undefined ||
        typeof valid !== "boolean" ||
        latitude === undefined ||
        longitude === undefined ||
        speed === undefined ||
        course === undefined) {
        return null;
    }
    return {
        deviceId,
        valid,
        latitude,
        longitude,
        speed,
        course,
        accuracy: parseFiniteNumber(body.accuracy),
        altitude: parseFiniteNumber(body.altitude),
        fixTime: typeof body.fixTime === "string" ? body.fixTime : undefined,
        deviceTime: typeof body.deviceTime === "string" ? body.deviceTime : undefined,
        serverTime: typeof body.serverTime === "string" ? body.serverTime : undefined,
        attributes: parseAttributes(body.attributes)
    };
};
exports.parseTraccarPositionForwarderPayload = parseTraccarPositionForwarderPayload;
/** @deprecated Use {@link parseTraccarPositionForwarderPayload}. */
exports.parseTraccarWebhookPayload = exports.parseTraccarPositionForwarderPayload;
const knotsToKmh = (knots) => Math.round(knots * 1.852 * 10) / 10;
exports.knotsToKmh = knotsToKmh;
const resolveTraccarEventTime = (payload) => {
    const timeStr = payload.fixTime ?? payload.deviceTime ?? payload.serverTime;
    if (timeStr) {
        const parsed = new Date(timeStr);
        if (!Number.isNaN(parsed.getTime())) {
            return parsed;
        }
    }
    return new Date();
};
exports.resolveTraccarEventTime = resolveTraccarEventTime;
