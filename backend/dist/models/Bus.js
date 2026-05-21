"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Bus = void 0;
const mongoose_1 = require("mongoose");
const busSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    busNumber: { type: String, required: true },
    routeName: { type: String, required: true },
    driverName: { type: String, required: true },
    driverPhone: { type: String, required: true },
    capacity: { type: Number, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" }
}, { timestamps: true });
busSchema.index({ organizationId: 1 });
busSchema.index({ organizationId: 1, status: 1 });
busSchema.index({ organizationId: 1, busNumber: 1 }, { unique: true });
exports.Bus = (0, mongoose_1.model)("Bus", busSchema);
