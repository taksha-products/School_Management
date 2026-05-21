import { model, Schema, type Document, type Types } from "mongoose";

export type SchoolPaymentMode = "cash" | "upi" | "cheque" | "online";
export type FeeHeadPaymentStatus = "paid" | "partial";

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
  paymentMode: SchoolPaymentMode;
  upiTransactionId?: string;
  collectedBy: Types.ObjectId;
  feeHeadPayments: IFeeHeadPayment[];
  totalAmountDue: number;
  totalAmountPaid: number;
  totalLateFee: number;
  notes?: string;
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
      enum: ["cash", "upi", "cheque", "online"],
      default: "cash"
    },
    upiTransactionId: { type: String },
    collectedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    feeHeadPayments: { type: [feeHeadPaymentSchema], required: true },
    totalAmountDue: { type: Number, required: true },
    totalAmountPaid: { type: Number, required: true },
    totalLateFee: { type: Number, default: 0 },
    notes: { type: String }
  },
  { timestamps: true }
);

schoolFeePaymentSchema.index({ receiptNumber: 1 }, { unique: true });
schoolFeePaymentSchema.index({ organizationId: 1, studentId: 1, paymentDate: -1 });
schoolFeePaymentSchema.index({ organizationId: 1, paymentDate: -1 });
schoolFeePaymentSchema.index({ organizationId: 1, collectedBy: 1 });

export const SchoolFeePayment = model<ISchoolFeePayment>(
  "SchoolFeePayment",
  schoolFeePaymentSchema
);
