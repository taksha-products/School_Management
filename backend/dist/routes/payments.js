"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.paymentsWebhookRouter = void 0;
const express_1 = require("express");
const roleCheck_1 = require("../middleware/roleCheck");
const razorpay_1 = require("../services/razorpay");
const paymentProcessing_1 = require("../services/paymentProcessing");
const asyncHandler_1 = require("../utils/asyncHandler");
const orgFilter_1 = require("../utils/orgFilter");
const paymentsRouter = (0, express_1.Router)();
exports.paymentsWebhookRouter = (0, express_1.Router)();
const staffPaymentGuard = [(0, roleCheck_1.isSuperAdminOrOrgStaff)("canCollectFees")];
const onlinePaymentGuard = [roleCheck_1.canAccessOrg];
const paiseFromRupees = (rupees) => Math.round(rupees * 100);
const rupeesFromPaise = (paise) => paise / 100;
const buildReceipt = (feeType, record) => {
    if (feeType === "transport") {
        return (0, paymentProcessing_1.getTransportReceiptNumber)(record);
    }
    return record.receiptNumber;
};
const getStudentId = (feeType, record) => {
    if (feeType === "transport") {
        return record.studentId.toString();
    }
    return record.studentId.toString();
};
const getDescription = (feeType, record) => {
    if (feeType === "transport") {
        const transport = record;
        return `Transport fee ${transport.month} (${transport.academicYear})`;
    }
    const school = record;
    return `School fee ${school.academicYear}`;
};
paymentsRouter.post("/create-order", ...onlinePaymentGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    if (!orgId) {
        res.status(403).json({ success: false, message: "Organization scope required" });
        return;
    }
    const { feeType, feePaymentId, amount } = req.body;
    if (!feeType || !feePaymentId || amount === undefined) {
        res.status(400).json({ success: false, message: "feeType, feePaymentId, and amount are required" });
        return;
    }
    const record = await (0, paymentProcessing_1.findFeeRecord)(feeType, feePaymentId, orgId);
    if (!record) {
        res.status(404).json({ success: false, message: "Fee record not found" });
        return;
    }
    if (!(0, paymentProcessing_1.validateOutstandingAmount)(feeType, record, amount)) {
        res.status(400).json({ success: false, message: "Amount does not match outstanding fee balance" });
        return;
    }
    const studentId = getStudentId(feeType, record);
    const receiptRef = `pay_${feePaymentId.slice(-12)}_${Date.now()}`.slice(0, 40);
    const description = getDescription(feeType, record);
    const notes = {
        organizationId: orgId,
        studentId,
        paymentType: feeType,
        description
    };
    if (feeType === "transport") {
        notes.feePaymentId = feePaymentId;
    }
    else {
        notes.schoolFeePaymentId = feePaymentId;
    }
    const order = await (0, razorpay_1.createOrder)({
        amount: paiseFromRupees(amount),
        currency: "INR",
        receipt: receiptRef,
        notes
    });
    record.razorpayOrderId = order.id;
    await record.save();
    res.json({
        success: true,
        orderId: order.id,
        amount: order.amount,
        currency: order.currency,
        keyId: (0, razorpay_1.getRazorpayKeyId)()
    });
}));
paymentsRouter.post("/verify", ...onlinePaymentGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    if (!orgId) {
        res.status(403).json({ success: false, message: "Organization scope required" });
        return;
    }
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, feeType, feePaymentId } = req.body;
    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !feeType || !feePaymentId) {
        res.status(400).json({ success: false, message: "Missing required payment verification fields" });
        return;
    }
    const isValid = (0, razorpay_1.verifyPaymentSignature)({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!isValid) {
        res.status(400).json({
            success: false,
            error: "Payment verification failed",
            code: "SIGNATURE_INVALID"
        });
        return;
    }
    if (await (0, paymentProcessing_1.isRazorpayPaymentProcessed)(razorpayPaymentId)) {
        const existing = await (0, paymentProcessing_1.findRecordByRazorpayOrderId)(razorpayOrderId);
        res.json({
            success: true,
            receiptNumber: existing ? buildReceipt(existing.feeType, existing.record) : undefined
        });
        return;
    }
    const record = await (0, paymentProcessing_1.findFeeRecord)(feeType, feePaymentId, orgId);
    if (!record || record.razorpayOrderId !== razorpayOrderId) {
        res.status(404).json({ success: false, message: "Fee record not found or order mismatch" });
        return;
    }
    const razorpayPayment = await (0, razorpay_1.fetchPayment)(razorpayPaymentId);
    const amountRupees = rupeesFromPaise(razorpayPayment.amount);
    if (!(0, paymentProcessing_1.validateOutstandingAmount)(feeType, record, amountRupees)) {
        res.status(400).json({ success: false, message: "Paid amount does not match fee record" });
        return;
    }
    const paymentMode = (0, paymentProcessing_1.resolvePaymentModeFromRazorpay)(razorpayPayment.method, false);
    const studentId = getStudentId(feeType, record);
    let updated;
    if (feeType === "transport") {
        updated = await (0, paymentProcessing_1.markTransportPaid)({
            payment: record,
            amountPaid: amountRupees,
            paymentMode,
            collectedBy: authReq.user?.userId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            webhookVerified: false
        });
    }
    else {
        updated = await (0, paymentProcessing_1.markSchoolPaid)({
            payment: record,
            paymentMode,
            collectedBy: authReq.user?.userId,
            razorpayOrderId,
            razorpayPaymentId,
            razorpaySignature,
            webhookVerified: false,
            upiTransactionId: razorpayPaymentId
        });
    }
    (0, paymentProcessing_1.logPaymentEvent)("payment_verified", {
        organizationId: orgId,
        studentId,
        amount: amountRupees,
        mode: paymentMode,
        feeType,
        feePaymentId,
        razorpayPaymentId
    });
    res.json({ success: true, receiptNumber: buildReceipt(feeType, updated) });
}));
paymentsRouter.post("/create-upi-qr", ...staffPaymentGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    if (!orgId) {
        res.status(403).json({ success: false, message: "Organization scope required" });
        return;
    }
    const { feeType, feePaymentId, amount } = req.body;
    if (!feeType || !feePaymentId || amount === undefined) {
        res.status(400).json({ success: false, message: "feeType, feePaymentId, and amount are required" });
        return;
    }
    const record = await (0, paymentProcessing_1.findFeeRecord)(feeType, feePaymentId, orgId);
    if (!record) {
        res.status(404).json({ success: false, message: "Fee record not found" });
        return;
    }
    if (!(0, paymentProcessing_1.validateOutstandingAmount)(feeType, record, amount)) {
        res.status(400).json({ success: false, message: "Amount does not match outstanding fee balance" });
        return;
    }
    const studentId = getStudentId(feeType, record);
    const description = getDescription(feeType, record);
    const notes = {
        organizationId: orgId,
        studentId,
        feePaymentId,
        paymentType: feeType,
        source: "bustrack_office"
    };
    if (feeType === "school") {
        notes.schoolFeePaymentId = feePaymentId;
    }
    const qr = await (0, razorpay_1.createUpiQr)({
        amount: paiseFromRupees(amount),
        description,
        notes
    });
    record.razorpayOrderId = qr.qrCodeId;
    await record.save();
    res.json({
        success: true,
        qrCodeUrl: qr.qrCodeUrl,
        qrCodeId: qr.qrCodeId,
        expiresAt: qr.expiresAt
    });
}));
paymentsRouter.get("/qr-status/:qrCodeId", ...staffPaymentGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const qrCodeId = String(req.params.qrCodeId);
    const match = await (0, paymentProcessing_1.findRecordByPaymentLinkId)(qrCodeId);
    if (!match) {
        res.status(404).json({ success: false, message: "QR code not found" });
        return;
    }
    const { feeType, record } = match;
    const isPaidInDb = feeType === "transport"
        ? record.status === "paid"
        : record.paymentStatus === "completed";
    if (isPaidInDb) {
        res.json({
            success: true,
            status: "paid",
            receiptNumber: buildReceipt(feeType, record)
        });
        return;
    }
    try {
        const qrEntity = await (0, razorpay_1.fetchQrCode)(qrCodeId);
        if ((0, razorpay_1.isQrCodePaidOnRazorpay)(qrEntity)) {
            // Webhook may still be processing — re-check DB after Razorpay confirms payment
            const refreshed = await (0, paymentProcessing_1.findRecordByPaymentLinkId)(qrCodeId);
            if (refreshed) {
                const paidAfterRefresh = refreshed.feeType === "transport"
                    ? refreshed.record.status === "paid"
                    : refreshed.record.paymentStatus === "completed";
                if (paidAfterRefresh) {
                    res.json({
                        success: true,
                        status: "paid",
                        receiptNumber: buildReceipt(refreshed.feeType, refreshed.record)
                    });
                    return;
                }
            }
        }
    }
    catch {
        // Fall through to pending if Razorpay status check fails
    }
    res.json({ success: true, status: "pending" });
}));
paymentsRouter.post("/record-cash", ...staffPaymentGuard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    if (!orgId || !authReq.user) {
        res.status(403).json({ success: false, message: "Organization scope required" });
        return;
    }
    const { feeType, feePaymentId, amount, notes } = req.body;
    if (!feeType || !feePaymentId || amount === undefined) {
        res.status(400).json({ success: false, message: "feeType, feePaymentId, and amount are required" });
        return;
    }
    const record = await (0, paymentProcessing_1.findFeeRecord)(feeType, feePaymentId, orgId);
    if (!record) {
        res.status(404).json({ success: false, message: "Fee record not found" });
        return;
    }
    if (!(0, paymentProcessing_1.validateOutstandingAmount)(feeType, record, amount)) {
        res.status(400).json({ success: false, message: "Amount does not match outstanding fee balance" });
        return;
    }
    const studentId = getStudentId(feeType, record);
    let updated;
    if (feeType === "transport") {
        updated = await (0, paymentProcessing_1.markTransportPaid)({
            payment: record,
            amountPaid: amount,
            paymentMode: "cash",
            collectedBy: authReq.user.userId,
            paymentNotes: notes,
            webhookVerified: false
        });
    }
    else {
        updated = await (0, paymentProcessing_1.markSchoolPaid)({
            payment: record,
            paymentMode: "cash",
            collectedBy: authReq.user.userId,
            paymentNotes: notes,
            webhookVerified: false
        });
    }
    (0, paymentProcessing_1.logPaymentEvent)("cash_recorded", {
        organizationId: orgId,
        studentId,
        amount,
        mode: "cash",
        feeType,
        feePaymentId
    });
    res.json({ success: true, receiptNumber: buildReceipt(feeType, updated) });
}));
const processCapturedPayment = async (paymentEntity, isOfficeQr) => {
    if (await (0, paymentProcessing_1.isRazorpayPaymentProcessed)(paymentEntity.id)) {
        return;
    }
    const notes = paymentEntity.notes ?? {};
    const feeType = notes.paymentType ?? "transport";
    const feePaymentId = notes.feePaymentId ?? notes.schoolFeePaymentId;
    const organizationId = notes.organizationId;
    const studentId = notes.studentId;
    if (!feePaymentId || !organizationId) {
        const byOrder = paymentEntity.order_id
            ? await (0, paymentProcessing_1.findRecordByRazorpayOrderId)(paymentEntity.order_id)
            : null;
        if (!byOrder) {
            console.warn("Webhook payment missing notes and order lookup failed", paymentEntity.id);
            return;
        }
        await applyWebhookPayment(byOrder.feeType, byOrder.record, paymentEntity, isOfficeQr);
        return;
    }
    const record = await (0, paymentProcessing_1.findFeeRecord)(feeType, feePaymentId, organizationId);
    if (!record) {
        console.warn("Webhook payment record not found", { feePaymentId, organizationId });
        return;
    }
    await applyWebhookPayment(feeType, record, paymentEntity, isOfficeQr);
    if (studentId) {
        (0, paymentProcessing_1.logPaymentEvent)("webhook_payment_captured", {
            organizationId,
            studentId,
            amount: rupeesFromPaise(paymentEntity.amount),
            mode: (0, paymentProcessing_1.resolvePaymentModeFromRazorpay)(paymentEntity.method ?? "upi", isOfficeQr),
            feeType,
            feePaymentId,
            razorpayPaymentId: paymentEntity.id,
            event: "payment.captured"
        });
    }
};
const applyWebhookPayment = async (feeType, record, paymentEntity, isOfficeQr) => {
    const amountRupees = rupeesFromPaise(paymentEntity.amount);
    if (!(0, paymentProcessing_1.validateOutstandingAmount)(feeType, record, amountRupees)) {
        console.warn("Webhook amount mismatch", {
            feePaymentId: record._id.toString(),
            expected: feeType === "transport" ? (0, paymentProcessing_1.getTransportOutstanding)(record) : record.totalAmountPaid,
            received: amountRupees
        });
        return;
    }
    const paymentMode = (0, paymentProcessing_1.resolvePaymentModeFromRazorpay)(paymentEntity.method ?? "upi", isOfficeQr);
    if (feeType === "transport") {
        await (0, paymentProcessing_1.markTransportPaid)({
            payment: record,
            amountPaid: amountRupees,
            paymentMode,
            razorpayOrderId: paymentEntity.order_id,
            razorpayPaymentId: paymentEntity.id,
            webhookVerified: true
        });
        return;
    }
    await (0, paymentProcessing_1.markSchoolPaid)({
        payment: record,
        paymentMode,
        razorpayOrderId: paymentEntity.order_id,
        razorpayPaymentId: paymentEntity.id,
        webhookVerified: true,
        upiTransactionId: paymentEntity.id
    });
};
exports.paymentsWebhookRouter.post("/", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];
    if (!webhookSecret || typeof signature !== "string") {
        res.status(400).json({ success: false, message: "Invalid webhook request" });
        return;
    }
    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);
    if (!(0, razorpay_1.verifyWebhookSignature)(rawBody, signature, webhookSecret)) {
        console.warn("Razorpay webhook signature verification failed", {
            timestamp: new Date().toISOString()
        });
        res.status(400).json({ success: false, message: "Invalid signature" });
        return;
    }
    let event;
    try {
        event = JSON.parse(rawBody);
    }
    catch {
        res.status(400).json({ success: false, message: "Invalid JSON payload" });
        return;
    }
    console.info({
        type: "payment_webhook",
        event: event.event,
        timestamp: new Date().toISOString()
    });
    try {
        if (event.event === "payment.captured") {
            const paymentEntity = event.payload?.payment?.entity;
            if (paymentEntity) {
                await processCapturedPayment(paymentEntity, false);
            }
        }
        else if (event.event === "payment_link.paid") {
            const paymentEntity = event.payload?.payment?.entity;
            if (paymentEntity) {
                await processCapturedPayment(paymentEntity, true);
            }
            else {
                const linkEntity = event.payload?.payment_link?.entity;
                if (linkEntity) {
                    const match = await (0, paymentProcessing_1.findRecordByPaymentLinkId)(linkEntity.id);
                    if (match && !match.record.razorpayPaymentId) {
                        const amountRupees = rupeesFromPaise(linkEntity.amount);
                        if ((0, paymentProcessing_1.validateOutstandingAmount)(match.feeType, match.record, amountRupees)) {
                            await applyWebhookPayment(match.feeType, match.record, {
                                id: linkEntity.id,
                                order_id: linkEntity.id,
                                amount: linkEntity.amount,
                                currency: "INR",
                                status: "captured",
                                method: "upi",
                                notes: linkEntity.notes
                            }, true);
                        }
                    }
                }
            }
        }
        else if (event.event === "payment.failed") {
            const failed = event.payload?.payment?.entity;
            console.warn({
                type: "payment_webhook",
                event: "payment.failed",
                paymentId: failed?.id,
                timestamp: new Date().toISOString()
            });
        }
    }
    catch (error) {
        console.error("Webhook processing error:", error instanceof Error ? error.message : error);
    }
    res.status(200).json({ success: true });
}));
exports.default = paymentsRouter;
