import { Types } from "mongoose";

import { FeePayment, type IFeePayment } from "../models/FeePayment";
import { SchoolFeePayment, type ISchoolFeePayment } from "../models/SchoolFeePayment";
import type { FeeType, PaymentMode } from "../types/payment";
import { mapRazorpayMethodToPaymentMode } from "../types/payment";
import { applySchoolPaymentLinesToLedger } from "./schoolFeeCollection";
import { invalidateOrgReportsCache, invalidateOrgSchoolFeesCache } from "../utils/cache";

interface PaymentLogDetails {
  organizationId: string;
  studentId: string;
  amount: number;
  mode: PaymentMode | string;
  feeType: FeeType;
  feePaymentId: string;
  razorpayPaymentId?: string;
  event?: string;
}

/**
 * Structured payment event logger (never logs secrets).
 */
export const logPaymentEvent = (event: string, details: PaymentLogDetails): void => {
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

/** Outstanding amount in rupees for a transport fee record. */
export const getTransportOutstanding = (payment: IFeePayment): number =>
  Math.max(0, payment.amount - payment.amountPaid);

/** Receipt reference for a transport fee payment. */
export const getTransportReceiptNumber = (payment: IFeePayment): string =>
  `RCP-T-${payment._id.toString().slice(-8).toUpperCase()}`;

/**
 * Returns true if a Razorpay payment id was already processed (idempotency guard).
 */
export const isRazorpayPaymentProcessed = async (razorpayPaymentId: string): Promise<boolean> => {
  const [transport, school] = await Promise.all([
    FeePayment.exists({ razorpayPaymentId }),
    SchoolFeePayment.exists({ razorpayPaymentId })
  ]);
  return Boolean(transport || school);
};

export const findFeeRecord = async (
  feeType: FeeType,
  feePaymentId: string,
  organizationId: string
): Promise<IFeePayment | ISchoolFeePayment | null> => {
  const orgObjectId = new Types.ObjectId(organizationId);

  if (feeType === "transport") {
    return FeePayment.findOne({ _id: feePaymentId, organizationId: orgObjectId });
  }

  return SchoolFeePayment.findOne({ _id: feePaymentId, organizationId: orgObjectId });
};

export const validateOutstandingAmount = (
  feeType: FeeType,
  record: IFeePayment | ISchoolFeePayment,
  amountInRupees: number
): boolean => {
  if (feeType === "transport") {
    const transport = record as IFeePayment;
    if (transport.status === "paid") {
      return false;
    }
    const outstanding = getTransportOutstanding(transport);
    return amountInRupees > 0 && amountInRupees <= outstanding + 0.01;
  }

  const school = record as ISchoolFeePayment;
  if (school.paymentStatus === "completed") {
    return false;
  }
  return amountInRupees > 0 && amountInRupees <= school.totalAmountPaid + 0.01;
};

export const markTransportPaid = async (params: {
  payment: IFeePayment;
  amountPaid: number;
  paymentMode: PaymentMode;
  collectedBy?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  webhookVerified?: boolean;
  paymentNotes?: string;
  transactionRef?: string;
}): Promise<IFeePayment> => {
  const { payment } = params;
  const newAmountPaid = payment.amountPaid + params.amountPaid;

  payment.amountPaid = newAmountPaid;
  payment.status = newAmountPaid >= payment.amount ? "paid" : "partial";
  payment.paidAt = new Date();
  payment.collectedAt = new Date();
  payment.paymentMode = params.paymentMode;
  payment.webhookVerified = params.webhookVerified ?? payment.webhookVerified;

  if (params.collectedBy) {
    payment.collectedBy = new Types.ObjectId(params.collectedBy);
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
  await invalidateOrgReportsCache(payment.organizationId.toString());
  return payment;
};

export const markSchoolPaid = async (params: {
  payment: ISchoolFeePayment;
  paymentMode: PaymentMode;
  collectedBy?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  webhookVerified?: boolean;
  paymentNotes?: string;
  transactionRef?: string;
  upiTransactionId?: string;
}): Promise<ISchoolFeePayment> => {
  const { payment } = params;
  const wasPending = payment.paymentStatus === "pending";

  payment.paymentStatus = "completed";
  payment.paymentDate = new Date();
  payment.collectedAt = new Date();
  payment.paymentMode = params.paymentMode;
  payment.webhookVerified = params.webhookVerified ?? payment.webhookVerified;

  if (params.collectedBy) {
    payment.collectedBy = new Types.ObjectId(params.collectedBy);
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
    await applySchoolPaymentLinesToLedger(
      payment.organizationId.toString(),
      payment.studentId.toString(),
      payment.academicYear,
      payment.feeHeadPayments.map((line) => ({
        feeHeadName: line.feeHeadName,
        periodLabel: line.periodLabel,
        amountPaid: line.amountPaid,
        lateFee: line.lateFee
      })),
      payment._id
    );
  }

  await invalidateOrgSchoolFeesCache(payment.organizationId.toString());
  return payment;
};

export const resolvePaymentModeFromRazorpay = (
  method: string,
  isOfficeQr: boolean
): PaymentMode => mapRazorpayMethodToPaymentMode(method, isOfficeQr);

export const findRecordByRazorpayOrderId = async (
  razorpayOrderId: string
): Promise<{ feeType: FeeType; record: IFeePayment | ISchoolFeePayment } | null> => {
  const transport = await FeePayment.findOne({ razorpayOrderId });
  if (transport) {
    return { feeType: "transport", record: transport };
  }

  const school = await SchoolFeePayment.findOne({ razorpayOrderId });
  if (school) {
    return { feeType: "school", record: school };
  }

  return null;
};

export const findRecordByPaymentLinkId = async (
  paymentLinkId: string
): Promise<{ feeType: FeeType; record: IFeePayment | ISchoolFeePayment } | null> => {
  return findRecordByRazorpayOrderId(paymentLinkId);
};
