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
        enum: [
            "cash",
            "upi_office",
            "upi_online",
            "card",
            "netbanking",
            "cheque",
            "other",
            "upi",
            "online"
        ],
        default: "cash"
    },
    paymentStatus: {
        type: String,
        enum: ["pending", "completed"],
        default: "completed"
    },
    upiTransactionId: { type: String },
    collectedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    feeHeadPayments: { type: [feeHeadPaymentSchema], required: true },
    totalAmountDue: { type: Number, required: true },
    totalAmountPaid: { type: Number, required: true },
    totalLateFee: { type: Number, default: 0 },
    notes: { type: String },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    transactionRef: { type: String },
    collectedAt: { type: Date },
    paymentNotes: { type: String, maxlength: 500 },
    webhookVerified: { type: Boolean, default: false }
}, { timestamps: true });
schoolFeePaymentSchema.index({ receiptNumber: 1 }, { unique: true });
schoolFeePaymentSchema.index({ organizationId: 1, studentId: 1, paymentDate: -1 });
schoolFeePaymentSchema.index({ organizationId: 1, paymentDate: -1 });
schoolFeePaymentSchema.index({ organizationId: 1, collectedBy: 1 });
schoolFeePaymentSchema.index({ razorpayOrderId: 1 }, { sparse: true });
schoolFeePaymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });
exports.SchoolFeePayment = (0, mongoose_1.model)("SchoolFeePayment", schoolFeePaymentSchema);
