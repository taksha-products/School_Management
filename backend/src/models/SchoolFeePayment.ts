import { model, Schema, type Document, type Types } from "mongoose";

import type { PaymentMode } from "../types/payment";

export type FeeHeadPaymentStatus = "paid" | "partial";

export type SchoolPaymentStatus = "pending" | "completed";

export interface IFeeHeadPayment {
  feeHeadName: string;
  periodLabel: string;
  amountDue: number;
  amountPaid: number;
  lateFee: number;
  status: FeeHeadPaymentStatus;
}

export interface ISchoolFeePayment extends Document {
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  receiptNumber: string;
  academicYear: string;
  paymentDate: Date;
  paymentMode: PaymentMode;
  paymentStatus: SchoolPaymentStatus;
  upiTransactionId?: string;
  collectedBy: Types.ObjectId;
  feeHeadPayments: IFeeHeadPayment[];
  totalAmountDue: number;
  totalAmountPaid: number;
  totalLateFee: number;
  notes?: string;
  razorpayOrderId?: string;
  razorpayPaymentId?: string;
  razorpaySignature?: string;
  transactionRef?: string;
  collectedAt?: Date;
  paymentNotes?: string;
  webhookVerified: boolean;
}

const feeHeadPaymentSchema = new Schema<IFeeHeadPayment>(
  {
    feeHeadName: { type: String, required: true },
    periodLabel: { type: String, required: true },
    amountDue: { type: Number, required: true },
    amountPaid: { type: Number, required: true },
    lateFee: { type: Number, default: 0 },
    status: { type: String, enum: ["paid", "partial"], required: true }
  },
  { _id: false }
);

const schoolFeePaymentSchema = new Schema<ISchoolFeePayment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
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
    collectedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
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
  },
  { timestamps: true }
);

schoolFeePaymentSchema.index({ receiptNumber: 1 }, { unique: true });
schoolFeePaymentSchema.index({ organizationId: 1, studentId: 1, paymentDate: -1 });
schoolFeePaymentSchema.index({ organizationId: 1, paymentDate: -1 });
schoolFeePaymentSchema.index({ organizationId: 1, collectedBy: 1 });
schoolFeePaymentSchema.index({ razorpayOrderId: 1 }, { sparse: true });
schoolFeePaymentSchema.index({ razorpayPaymentId: 1 }, { unique: true, sparse: true });

/**
 * Only real (completed) payments. Online checkouts create a `pending` record
 * when started; those must not appear as receipts or count as collected money
 * until verified. Older records have no status and count as completed.
 */
export const COMPLETED_PAYMENT_FILTER = { paymentStatus: { $ne: "pending" } } as const;

export const SchoolFeePayment = model<ISchoolFeePayment>(
  "SchoolFeePayment",
  schoolFeePaymentSchema
);
