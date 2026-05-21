"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeGroup = void 0;
const mongoose_1 = require("mongoose");
const feeGroupSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Student", required: true },
    busId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Bus", required: true },
    months: [{ type: String, required: true }],
    totalAmount: { type: Number, required: true },
    totalDue: { type: Number, required: true },
    academicYear: { type: String, required: true },
    collectedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    collectedAt: { type: Date, required: true },
    notes: { type: String },
    receiptNumber: { type: String }
}, { timestamps: true });
feeGroupSchema.index({ organizationId: 1, studentId: 1 });
feeGroupSchema.index({ organizationId: 1, collectedAt: -1 });
exports.FeeGroup = (0, mongoose_1.model)("FeeGroup", feeGroupSchema);
