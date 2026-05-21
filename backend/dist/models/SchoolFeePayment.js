"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SchoolFeePayment = void 0;
const mongoose_1 = require("mongoose");
const feeHeadPaymentSchema = new mongoose_1.Schema({
    feeHeadName: { type: String, required: true },
    periodLabel: { type: String, required: true },
    amountDue: { type: Number, required: true },
    amountPaid: { type: Number, required: true },
    lateFee: { type: Number, default: 0 },
    status: { type: String, enum: ["paid", "partial"], required: true }
}, { _id: false });
const schoolFeePaymentSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Student", required: true },
    receiptNumber: { type: String, required: true },
    academicYear: { type: String, required: true },
    paymentDate: { type: Date, required: true, default: Date.now },
    paymentMode: {
        type: String,
        enum: ["cash", "upi", "cheque", "online"],
        default: "cash"
    },
    upiTransactionId: { type: String },
    collectedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    feeHeadPayments: { type: [feeHeadPaymentSchema], required: true },
    totalAmountDue: { type: Number, required: true },
    totalAmountPaid: { type: Number, required: true },
    totalLateFee: { type: Number, default: 0 },
    notes: { type: String }
}, { timestamps: true });
schoolFeePaymentSchema.index({ receiptNumber: 1 }, { unique: true });
schoolFeePaymentSchema.index({ organizationId: 1, studentId: 1, paymentDate: -1 });
schoolFeePaymentSchema.index({ organizationId: 1, paymentDate: -1 });
schoolFeePaymentSchema.index({ organizationId: 1, collectedBy: 1 });
exports.SchoolFeePayment = (0, mongoose_1.model)("SchoolFeePayment", schoolFeePaymentSchema);
