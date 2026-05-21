"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeLedger = void 0;
const mongoose_1 = require("mongoose");
const feeLedgerSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Student", required: true },
    feeStructureId: { type: mongoose_1.Schema.Types.ObjectId, ref: "FeeStructure" },
    feeHeadName: { type: String, required: true },
    periodLabel: { type: String, required: true },
    amountDue: { type: Number, required: true },
    amountPaid: { type: Number, default: 0 },
    lateFee: { type: Number, default: 0 },
    status: {
        type: String,
        enum: ["paid", "partial", "pending", "overdue"],
        default: "pending"
    },
    dueDate: { type: Date },
    paymentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "SchoolFeePayment" },
    academicYear: { type: String, required: true }
}, { timestamps: true });
feeLedgerSchema.index({ organizationId: 1, studentId: 1, academicYear: 1 });
feeLedgerSchema.index({ organizationId: 1, studentId: 1, feeHeadName: 1, periodLabel: 1 }, { unique: true });
feeLedgerSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
feeLedgerSchema.index({ organizationId: 1, academicYear: 1, status: 1 });
exports.FeeLedger = (0, mongoose_1.model)("FeeLedger", feeLedgerSchema);
