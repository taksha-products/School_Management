"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.GpsDevice = void 0;
const mongoose_1 = require("mongoose");
const gpsDeviceSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    busId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Bus", required: true },
    traccarDeviceId: { type: Number, required: true },
    traccarUniqueId: { type: String, required: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    lastSeen: { type: Date },
    lastLat: { type: Number },
    lastLng: { type: Number },
    lastSpeed: { type: Number },
    lastBearing: { type: Number, min: 0, max: 360 },
    lastAccuracy: { type: Number },
    firmwareVersion: { type: String },
    batteryLevel: { type: Number, min: 0, max: 100 }
}, { timestamps: true });
gpsDeviceSchema.index({ organizationId: 1, busId: 1 }, { unique: true });
gpsDeviceSchema.index({ traccarUniqueId: 1 }, { unique: true });
gpsDeviceSchema.index({ traccarDeviceId: 1 }, { unique: true });
gpsDeviceSchema.index({ organizationId: 1, isActive: 1 });
exports.GpsDevice = (0, mongoose_1.model)("GpsDevice", gpsDeviceSchema);
