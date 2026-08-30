import { Router, type Request, type Response } from "express";
import { Types } from "mongoose";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { isSuperAdminOrOrgStaff, canAccessOrg } from "../middleware/roleCheck";
import { FeePayment, type IFeePayment } from "../models/FeePayment";
import { SchoolFeePayment, type ISchoolFeePayment } from "../models/SchoolFeePayment";
import {
  createOrder,
  createUpiQr,
  fetchPayment,
  fetchQrCode,
  getRazorpayKeyId,
  isQrCodePaidOnRazorpay,
  verifyPaymentSignature,
  verifyWebhookSignature
} from "../services/razorpay";
import {
  findFeeRecord,
  findRecordByPaymentLinkId,
  findRecordByRazorpayOrderId,
  getTransportOutstanding,
  getTransportReceiptNumber,
  isRazorpayPaymentProcessed,
  logPaymentEvent,
  markSchoolPaid,
  markTransportPaid,
  resolvePaymentModeFromRazorpay,
  validateOutstandingAmount
} from "../services/paymentProcessing";
import type { FeeType } from "../types/payment";
import { asyncHandler } from "../utils/asyncHandler";
import { getScopedOrganizationId } from "../utils/orgFilter";

const paymentsRouter = Router();
export const paymentsWebhookRouter = Router();

const staffPaymentGuard = [isSuperAdminOrOrgStaff("canCollectFees")] as const;

const onlinePaymentGuard = [canAccessOrg] as const;

const paiseFromRupees = (rupees: number): number => Math.round(rupees * 100);

const rupeesFromPaise = (paise: number): number => paise / 100;

const buildReceipt = (feeType: FeeType, record: IFeePayment | ISchoolFeePayment): string => {
  if (feeType === "transport") {
    return getTransportReceiptNumber(record as IFeePayment);
  }
  return (record as ISchoolFeePayment).receiptNumber;
};

const getStudentId = (feeType: FeeType, record: IFeePayment | ISchoolFeePayment): string => {
  if (feeType === "transport") {
    return (record as IFeePayment).studentId.toString();
  }
  return (record as ISchoolFeePayment).studentId.toString();
};

const getDescription = (feeType: FeeType, record: IFeePayment | ISchoolFeePayment): string => {
  if (feeType === "transport") {
    const transport = record as IFeePayment;
    return `Transport fee ${transport.month} (${transport.academicYear})`;
  }
  const school = record as ISchoolFeePayment;
  return `School fee ${school.academicYear}`;
};

interface CreateOrderBody {
  feeType?: FeeType;
  feePaymentId?: string;
  amount?: number;
}

paymentsRouter.post(
  "/create-order",
  ...onlinePaymentGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res);
    if (!orgId) {
      res.status(403).json({ success: false, message: "Organization scope required" });
      return;
    }

    const { feeType, feePaymentId, amount } = req.body as CreateOrderBody;
    if (!feeType || !feePaymentId || amount === undefined) {
      res.status(400).json({ success: false, message: "feeType, feePaymentId, and amount are required" });
      return;
    }

    const record = await findFeeRecord(feeType, feePaymentId, orgId);
    if (!record) {
      res.status(404).json({ success: false, message: "Fee record not found" });
      return;
    }

    if (!validateOutstandingAmount(feeType, record, amount)) {
      res.status(400).json({ success: false, message: "Amount does not match outstanding fee balance" });
      return;
    }

    const studentId = getStudentId(feeType, record);
    const receiptRef = `pay_${feePaymentId.slice(-12)}_${Date.now()}`.slice(0, 40);
    const description = getDescription(feeType, record);

    const notes: Record<string, string> = {
      organizationId: orgId,
      studentId,
      paymentType: feeType,
      description
    };
    if (feeType === "transport") {
      notes.feePaymentId = feePaymentId;
    } else {
      notes.schoolFeePaymentId = feePaymentId;
    }

    const order = await createOrder({
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
      keyId: getRazorpayKeyId()
    });
  })
);

interface VerifyBody {
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  feeType?: FeeType;
  feePaymentId?: string;
}

paymentsRouter.post(
  "/verify",
  ...onlinePaymentGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res);
    if (!orgId) {
      res.status(403).json({ success: false, message: "Organization scope required" });
      return;
    }

    const { razorpayOrderId, razorpayPaymentId, razorpaySignature, feeType, feePaymentId } =
      req.body as VerifyBody;

    if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature || !feeType || !feePaymentId) {
      res.status(400).json({ success: false, message: "Missing required payment verification fields" });
      return;
    }

    const isValid = verifyPaymentSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!isValid) {
      res.status(400).json({
        success: false,
        error: "Payment verification failed",
        code: "SIGNATURE_INVALID"
      });
      return;
    }

    if (await isRazorpayPaymentProcessed(razorpayPaymentId)) {
      const existing = await findRecordByRazorpayOrderId(razorpayOrderId);
      res.json({
        success: true,
        receiptNumber: existing ? buildReceipt(existing.feeType, existing.record) : undefined
      });
      return;
    }

    const record = await findFeeRecord(feeType, feePaymentId, orgId);
    if (!record || record.razorpayOrderId !== razorpayOrderId) {
      res.status(404).json({ success: false, message: "Fee record not found or order mismatch" });
      return;
    }

    const razorpayPayment = await fetchPayment(razorpayPaymentId);
    const amountRupees = rupeesFromPaise(razorpayPayment.amount);

    if (!validateOutstandingAmount(feeType, record, amountRupees)) {
      res.status(400).json({ success: false, message: "Paid amount does not match fee record" });
      return;
    }

    const paymentMode = resolvePaymentModeFromRazorpay(razorpayPayment.method, false);
    const studentId = getStudentId(feeType, record);

    let updated: IFeePayment | ISchoolFeePayment;
    if (feeType === "transport") {
      updated = await markTransportPaid({
        payment: record as IFeePayment,
        amountPaid: amountRupees,
        paymentMode,
        collectedBy: authReq.user?.userId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        webhookVerified: false
      });
    } else {
      updated = await markSchoolPaid({
        payment: record as ISchoolFeePayment,
        paymentMode,
        collectedBy: authReq.user?.userId,
        razorpayOrderId,
        razorpayPaymentId,
        razorpaySignature,
        webhookVerified: false,
        upiTransactionId: razorpayPaymentId
      });
    }

    logPaymentEvent("payment_verified", {
      organizationId: orgId,
      studentId,
      amount: amountRupees,
      mode: paymentMode,
      feeType,
      feePaymentId,
      razorpayPaymentId
    });

    res.json({ success: true, receiptNumber: buildReceipt(feeType, updated) });
  })
);

paymentsRouter.post(
  "/create-upi-qr",
  ...staffPaymentGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res);
    if (!orgId) {
      res.status(403).json({ success: false, message: "Organization scope required" });
      return;
    }

    const { feeType, feePaymentId, amount } = req.body as CreateOrderBody;
    if (!feeType || !feePaymentId || amount === undefined) {
      res.status(400).json({ success: false, message: "feeType, feePaymentId, and amount are required" });
      return;
    }

    const record = await findFeeRecord(feeType, feePaymentId, orgId);
    if (!record) {
      res.status(404).json({ success: false, message: "Fee record not found" });
      return;
    }

    if (!validateOutstandingAmount(feeType, record, amount)) {
      res.status(400).json({ success: false, message: "Amount does not match outstanding fee balance" });
      return;
    }

    const studentId = getStudentId(feeType, record);
    const description = getDescription(feeType, record);

    const notes: Record<string, string> = {
      organizationId: orgId,
      studentId,
      feePaymentId,
      paymentType: feeType,
      source: "taksha_office"
    };
    if (feeType === "school") {
      notes.schoolFeePaymentId = feePaymentId;
    }

    const qr = await createUpiQr({
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
  })
);

paymentsRouter.get(
  "/qr-status/:qrCodeId",
  ...staffPaymentGuard,
  asyncHandler(async (req, res) => {
    const qrCodeId = String(req.params.qrCodeId);
    const match = await findRecordByPaymentLinkId(qrCodeId);

    if (!match) {
      res.status(404).json({ success: false, message: "QR code not found" });
      return;
    }

    const { feeType, record } = match;
    const isPaidInDb =
      feeType === "transport"
        ? (record as IFeePayment).status === "paid"
        : (record as ISchoolFeePayment).paymentStatus === "completed";

    if (isPaidInDb) {
      res.json({
        success: true,
        status: "paid" as const,
        receiptNumber: buildReceipt(feeType, record)
      });
      return;
    }

    try {
      const qrEntity = await fetchQrCode(qrCodeId);
      if (isQrCodePaidOnRazorpay(qrEntity)) {
        // Webhook may still be processing — re-check DB after Razorpay confirms payment
        const refreshed = await findRecordByPaymentLinkId(qrCodeId);
        if (refreshed) {
          const paidAfterRefresh =
            refreshed.feeType === "transport"
              ? (refreshed.record as IFeePayment).status === "paid"
              : (refreshed.record as ISchoolFeePayment).paymentStatus === "completed";

          if (paidAfterRefresh) {
            res.json({
              success: true,
              status: "paid" as const,
              receiptNumber: buildReceipt(refreshed.feeType, refreshed.record)
            });
            return;
          }
        }
      }
    } catch {
      // Fall through to pending if Razorpay status check fails
    }

    res.json({ success: true, status: "pending" as const });
  })
);

interface RecordCashBody {
  feeType?: FeeType;
  feePaymentId?: string;
  amount?: number;
  notes?: string;
}

paymentsRouter.post(
  "/record-cash",
  ...staffPaymentGuard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res);
    if (!orgId || !authReq.user) {
      res.status(403).json({ success: false, message: "Organization scope required" });
      return;
    }

    const { feeType, feePaymentId, amount, notes } = req.body as RecordCashBody;
    if (!feeType || !feePaymentId || amount === undefined) {
      res.status(400).json({ success: false, message: "feeType, feePaymentId, and amount are required" });
      return;
    }

    const record = await findFeeRecord(feeType, feePaymentId, orgId);
    if (!record) {
      res.status(404).json({ success: false, message: "Fee record not found" });
      return;
    }

    if (!validateOutstandingAmount(feeType, record, amount)) {
      res.status(400).json({ success: false, message: "Amount does not match outstanding fee balance" });
      return;
    }

    const studentId = getStudentId(feeType, record);
    let updated: IFeePayment | ISchoolFeePayment;

    if (feeType === "transport") {
      updated = await markTransportPaid({
        payment: record as IFeePayment,
        amountPaid: amount,
        paymentMode: "cash",
        collectedBy: authReq.user.userId,
        paymentNotes: notes,
        webhookVerified: false
      });
    } else {
      updated = await markSchoolPaid({
        payment: record as ISchoolFeePayment,
        paymentMode: "cash",
        collectedBy: authReq.user.userId,
        paymentNotes: notes,
        webhookVerified: false
      });
    }

    logPaymentEvent("cash_recorded", {
      organizationId: orgId,
      studentId,
      amount,
      mode: "cash",
      feeType,
      feePaymentId
    });

    res.json({ success: true, receiptNumber: buildReceipt(feeType, updated) });
  })
);

interface RazorpayWebhookPaymentEntity {
  id: string;
  order_id?: string;
  amount: number;
  currency: string;
  status: string;
  method?: string;
  notes?: Record<string, string>;
}

interface RazorpayWebhookPayload {
  event: string;
  payload?: {
    payment?: { entity?: RazorpayWebhookPaymentEntity };
    payment_link?: {
      entity?: {
        id: string;
        amount: number;
        notes?: Record<string, string>;
      };
    };
  };
}

const processCapturedPayment = async (
  paymentEntity: RazorpayWebhookPaymentEntity,
  isOfficeQr: boolean
): Promise<void> => {
  if (await isRazorpayPaymentProcessed(paymentEntity.id)) {
    return;
  }

  const notes = paymentEntity.notes ?? {};
  const feeType = (notes.paymentType as FeeType | undefined) ?? "transport";
  const feePaymentId = notes.feePaymentId ?? notes.schoolFeePaymentId;
  const organizationId = notes.organizationId;
  const studentId = notes.studentId;

  if (!feePaymentId || !organizationId) {
    const byOrder = paymentEntity.order_id
      ? await findRecordByRazorpayOrderId(paymentEntity.order_id)
      : null;
    if (!byOrder) {
      console.warn("Webhook payment missing notes and order lookup failed", paymentEntity.id);
      return;
    }
    await applyWebhookPayment(byOrder.feeType, byOrder.record, paymentEntity, isOfficeQr);
    return;
  }

  const record = await findFeeRecord(feeType, feePaymentId, organizationId);
  if (!record) {
    console.warn("Webhook payment record not found", { feePaymentId, organizationId });
    return;
  }

  await applyWebhookPayment(feeType, record, paymentEntity, isOfficeQr);

  if (studentId) {
    logPaymentEvent("webhook_payment_captured", {
      organizationId,
      studentId,
      amount: rupeesFromPaise(paymentEntity.amount),
      mode: resolvePaymentModeFromRazorpay(paymentEntity.method ?? "upi", isOfficeQr),
      feeType,
      feePaymentId,
      razorpayPaymentId: paymentEntity.id,
      event: "payment.captured"
    });
  }
};

const applyWebhookPayment = async (
  feeType: FeeType,
  record: IFeePayment | ISchoolFeePayment,
  paymentEntity: RazorpayWebhookPaymentEntity,
  isOfficeQr: boolean
): Promise<void> => {
  const amountRupees = rupeesFromPaise(paymentEntity.amount);

  if (!validateOutstandingAmount(feeType, record, amountRupees)) {
    console.warn("Webhook amount mismatch", {
      feePaymentId: record._id.toString(),
      expected: feeType === "transport" ? getTransportOutstanding(record as IFeePayment) : (record as ISchoolFeePayment).totalAmountPaid,
      received: amountRupees
    });
    return;
  }

  const paymentMode = resolvePaymentModeFromRazorpay(paymentEntity.method ?? "upi", isOfficeQr);

  if (feeType === "transport") {
    await markTransportPaid({
      payment: record as IFeePayment,
      amountPaid: amountRupees,
      paymentMode,
      razorpayOrderId: paymentEntity.order_id,
      razorpayPaymentId: paymentEntity.id,
      webhookVerified: true
    });
    return;
  }

  await markSchoolPaid({
    payment: record as ISchoolFeePayment,
    paymentMode,
    razorpayOrderId: paymentEntity.order_id,
    razorpayPaymentId: paymentEntity.id,
    webhookVerified: true,
    upiTransactionId: paymentEntity.id
  });
};

paymentsWebhookRouter.post(
  "/",
  asyncHandler(async (req: Request, res: Response) => {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const signature = req.headers["x-razorpay-signature"];

    if (!webhookSecret || typeof signature !== "string") {
      res.status(400).json({ success: false, message: "Invalid webhook request" });
      return;
    }

    const rawBody = Buffer.isBuffer(req.body) ? req.body.toString("utf8") : String(req.body);

    if (!verifyWebhookSignature(rawBody, signature, webhookSecret)) {
      console.warn("Razorpay webhook signature verification failed", {
        timestamp: new Date().toISOString()
      });
      res.status(400).json({ success: false, message: "Invalid signature" });
      return;
    }

    let event: RazorpayWebhookPayload;
    try {
      event = JSON.parse(rawBody) as RazorpayWebhookPayload;
    } catch {
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
      } else if (event.event === "payment_link.paid") {
        const paymentEntity = event.payload?.payment?.entity;
        if (paymentEntity) {
          await processCapturedPayment(paymentEntity, true);
        } else {
          const linkEntity = event.payload?.payment_link?.entity;
          if (linkEntity) {
            const match = await findRecordByPaymentLinkId(linkEntity.id);
            if (match && !match.record.razorpayPaymentId) {
              const amountRupees = rupeesFromPaise(linkEntity.amount);
              if (validateOutstandingAmount(match.feeType, match.record, amountRupees)) {
                await applyWebhookPayment(
                  match.feeType,
                  match.record,
                  {
                    id: linkEntity.id,
                    order_id: linkEntity.id,
                    amount: linkEntity.amount,
                    currency: "INR",
                    status: "captured",
                    method: "upi",
                    notes: linkEntity.notes
                  },
                  true
                );
              }
            }
          }
        }
      } else if (event.event === "payment.failed") {
        const failed = event.payload?.payment?.entity;
        console.warn({
          type: "payment_webhook",
          event: "payment.failed",
          paymentId: failed?.id,
          timestamp: new Date().toISOString()
        });
      }
    } catch (error) {
      console.error("Webhook processing error:", error instanceof Error ? error.message : error);
    }

    res.status(200).json({ success: true });
  })
);

export default paymentsRouter;
