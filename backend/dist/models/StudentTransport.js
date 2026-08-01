"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentTransport = void 0;
const mongoose_1 = require("mongoose");
const studentTransportSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Student", required: true },
    busId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Bus", required: true },
    monthlyTransportFee: { type: Number, required: true, default: 1500 },
    pickupStop: { type: String },
    dropStop: { type: String },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date, default: null },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    academicYear: { type: String, required: true },
    addedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" }
}, { timestamps: true });
studentTransportSchema.index({ organizationId: 1, studentId: 1, status: 1 });
studentTransportSchema.index({ organizationId: 1, busId: 1, status: 1 });
studentTransportSchema.index({ organizationId: 1, academicYear: 1, status: 1 });
// Only one active transport per student at a time
studentTransportSchema.index({ organizationId: 1, studentId: 1 }, { unique: true, partialFilterExpression: { status: "active" } });
exports.StudentTransport = (0, mongoose_1.model)("StudentTransport", studentTransportSchema);
