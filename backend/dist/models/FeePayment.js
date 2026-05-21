"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeePayment = void 0;
const mongoose_1 = require("mongoose");
const feePaymentSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Student", required: true },
    busId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Bus", required: true },
    month: { type: String, required: true },
    academicYear: { type: String, required: true },
    amount: { type: Number, required: true },
    amountPaid: { type: Number, required: true },
    status: {
        type: String,
        enum: ["paid", "partial", "pending", "overdue"],
        required: true
    },
    paidAt: { type: Date },
    collectedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User" },
    notes: { type: String },
    feeGroupId: { type: mongoose_1.Schema.Types.ObjectId, ref: "FeeGroup" },
    paymentType: { type: String, enum: ["single", "advance"], default: "single" }
}, { timestamps: true });
feePaymentSchema.index({ organizationId: 1, month: 1 });
feePaymentSchema.index({ organizationId: 1, studentId: 1, month: 1 }, { unique: true });
feePaymentSchema.index({ organizationId: 1, busId: 1, month: 1 });
feePaymentSchema.index({ organizationId: 1, status: 1 });
exports.FeePayment = (0, mongoose_1.model)("FeePayment", feePaymentSchema);
