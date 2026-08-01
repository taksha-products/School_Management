"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.findRecordByPaymentLinkId = exports.findRecordByRazorpayOrderId = exports.resolvePaymentModeFromRazorpay = exports.markSchoolPaid = exports.markTransportPaid = exports.validateOutstandingAmount = exports.findFeeRecord = exports.isRazorpayPaymentProcessed = exports.getTransportReceiptNumber = exports.getTransportOutstanding = exports.logPaymentEvent = void 0;
const mongoose_1 = require("mongoose");
const FeePayment_1 = require("../models/FeePayment");
const SchoolFeePayment_1 = require("../models/SchoolFeePayment");
const payment_1 = require("../types/payment");
const schoolFeeCollection_1 = require("./schoolFeeCollection");
const cache_1 = require("../utils/cache");
/**
 * Structured payment event logger (never logs secrets).
 */
const logPaymentEvent = (event, details) => {
    console.info({
        type: "payment",
        event,
        timestamp: new Date().toISOString(),
        organizationId: details.organizationId,
        studentId: details.studentId,
        amount: details.amount,
        mode: details.mode,
        feeType: details.feeType,
        feePaymentId: details.feePaymentId,
        razorpayPaymentId: details.razorpayPaymentId
    });
};
exports.logPaymentEvent = logPaymentEvent;
/** Outstanding amount in rupees for a transport fee record. */
const getTransportOutstanding = (payment) => Math.max(0, payment.amount - payment.amountPaid);
exports.getTransportOutstanding = getTransportOutstanding;
/** Receipt reference for a transport fee payment. */
const getTransportReceiptNumber = (payment) => `RCP-T-${payment._id.toString().slice(-8).toUpperCase()}`;
exports.getTransportReceiptNumber = getTransportReceiptNumber;
/**
 * Returns true if a Razorpay payment id was already processed (idempotency guard).
 */
const isRazorpayPaymentProcessed = async (razorpayPaymentId) => {
    const [transport, school] = await Promise.all([
        FeePayment_1.FeePayment.exists({ razorpayPaymentId }),
        SchoolFeePayment_1.SchoolFeePayment.exists({ razorpayPaymentId })
    ]);
    return Boolean(transport || school);
};
exports.isRazorpayPaymentProcessed = isRazorpayPaymentProcessed;
const findFeeRecord = async (feeType, feePaymentId, organizationId) => {
    const orgObjectId = new mongoose_1.Types.ObjectId(organizationId);
    if (feeType === "transport") {
        return FeePayment_1.FeePayment.findOne({ _id: feePaymentId, organizationId: orgObjectId });
    }
    return SchoolFeePayment_1.SchoolFeePayment.findOne({ _id: feePaymentId, organizationId: orgObjectId });
};
exports.findFeeRecord = findFeeRecord;
const validateOutstandingAmount = (feeType, record, amountInRupees) => {
    if (feeType === "transport") {
        const transport = record;
        if (transport.status === "paid") {
            return false;
        }
        const outstanding = (0, exports.getTransportOutstanding)(transport);
        return amountInRupees > 0 && amountInRupees <= outstanding + 0.01;
    }
    const school = record;
    if (school.paymentStatus === "completed") {
        return false;
    }
    return amountInRupees > 0 && amountInRupees <= school.totalAmountPaid + 0.01;
};
exports.validateOutstandingAmount = validateOutstandingAmount;
const markTransportPaid = async (params) => {
    const { payment } = params;
    const newAmountPaid = payment.amountPaid + params.amountPaid;
    payment.amountPaid = newAmountPaid;
    payment.status = newAmountPaid >= payment.amount ? "paid" : "partial";
    payment.paidAt = new Date();
    payment.collectedAt = new Date();
    payment.paymentMode = params.paymentMode;
    payment.webhookVerified = params.webhookVerified ?? payment.webhookVerified;
    if (params.collectedBy) {
        payment.collectedBy = new mongoose_1.Types.ObjectId(params.collectedBy);
    }
    if (params.razorpayOrderId) {
        payment.razorpayOrderId = params.razorpayOrderId;
    }
    if (params.razorpayPaymentId) {
        payment.razorpayPaymentId = params.razorpayPaymentId;
    }
    if (params.razorpaySignature) {
        payment.razorpaySignature = params.razorpaySignature;
    }
    if (params.paymentNotes) {
        payment.paymentNotes = params.paymentNotes;
    }
    if (params.transactionRef) {
        payment.transactionRef = params.transactionRef;
    }
    await payment.save();
    await (0, cache_1.invalidateOrgReportsCache)(payment.organizationId.toString());
    return payment;
};
exports.markTransportPaid = markTransportPaid;
const markSchoolPaid = async (params) => {
    const { payment } = params;
    const wasPending = payment.paymentStatus === "pending";
    payment.paymentStatus = "completed";
    payment.paymentDate = new Date();
    payment.collectedAt = new Date();
    payment.paymentMode = params.paymentMode;
    payment.webhookVerified = params.webhookVerified ?? payment.webhookVerified;
    if (params.collectedBy) {
        payment.collectedBy = new mongoose_1.Types.ObjectId(params.collectedBy);
    }
    if (params.razorpayOrderId) {
        payment.razorpayOrderId = params.razorpayOrderId;
    }
    if (params.razorpayPaymentId) {
        payment.razorpayPaymentId = params.razorpayPaymentId;
    }
    if (params.razorpaySignature) {
        payment.razorpaySignature = params.razorpaySignature;
    }
    if (params.paymentNotes) {
        payment.paymentNotes = params.paymentNotes;
    }
    if (params.transactionRef) {
        payment.transactionRef = params.transactionRef;
    }
    if (params.upiTransactionId) {
        payment.upiTransactionId = params.upiTransactionId;
    }
    await payment.save();
    if (wasPending && payment.feeHeadPayments.length > 0) {
        await (0, schoolFeeCollection_1.applySchoolPaymentLinesToLedger)(payment.organizationId.toString(), payment.studentId.toString(), payment.academicYear, payment.feeHeadPayments.map((line) => ({
            feeHeadName: line.feeHeadName,
            periodLabel: line.periodLabel,
            amountPaid: line.amountPaid,
            lateFee: line.lateFee
        })), payment._id);
    }
    await (0, cache_1.invalidateOrgSchoolFeesCache)(payment.organizationId.toString());
    return payment;
};
exports.markSchoolPaid = markSchoolPaid;
const resolvePaymentModeFromRazorpay = (method, isOfficeQr) => (0, payment_1.mapRazorpayMethodToPaymentMode)(method, isOfficeQr);
exports.resolvePaymentModeFromRazorpay = resolvePaymentModeFromRazorpay;
const findRecordByRazorpayOrderId = async (razorpayOrderId) => {
    const transport = await FeePayment_1.FeePayment.findOne({ razorpayOrderId });
    if (transport) {
        return { feeType: "transport", record: transport };
    }
    const school = await SchoolFeePayment_1.SchoolFeePayment.findOne({ razorpayOrderId });
    if (school) {
        return { feeType: "school", record: school };
    }
    return null;
};
exports.findRecordByRazorpayOrderId = findRecordByRazorpayOrderId;
const findRecordByPaymentLinkId = async (paymentLinkId) => {
    return (0, exports.findRecordByRazorpayOrderId)(paymentLinkId);
};
exports.findRecordByPaymentLinkId = findRecordByPaymentLinkId;
