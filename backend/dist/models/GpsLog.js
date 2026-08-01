"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GpsLog = void 0;
const mongoose_1 = require("mongoose");
const gpsLogSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    deviceId: { type: mongoose_1.Schema.Types.ObjectId, ref: "GpsDevice", required: true },
    busId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Bus", required: true },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    speed: { type: Number, default: 0 },
    bearing: { type: Number, default: 0, min: 0, max: 360 },
    accuracy: { type: Number },
    altitude: { type: Number },
    satellites: { type: Number },
    traccarEventTime: { type: Date, required: true },
    receivedAt: { type: Date, default: Date.now },
    rawPayload: { type: mongoose_1.Schema.Types.Mixed }
}, { timestamps: true });
gpsLogSchema.index({ deviceId: 1, traccarEventTime: -1 });
gpsLogSchema.index({ busId: 1, traccarEventTime: -1 });
gpsLogSchema.index({ organizationId: 1, traccarEventTime: -1 });
gpsLogSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 2_592_000 });
exports.GpsLog = (0, mongoose_1.model)("GpsLog", gpsLogSchema);
