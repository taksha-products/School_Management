import { model, Schema, type Document, type Types } from "mongoose";

export type FeePaymentStatus = "paid" | "partial" | "pending" | "overdue";

export type FeePaymentType = "single" | "advance";

export interface IFeePayment extends Document {
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  busId: Types.ObjectId;
  transportId?: Types.ObjectId;
  month: string;
  academicYear: string;
  amount: number;
  amountPaid: number;
  status: FeePaymentStatus;
  paidAt?: Date;
  collectedBy?: Types.ObjectId;
  notes?: string;
  feeGroupId?: Types.ObjectId;
  paymentType?: FeePaymentType;
}

const feePaymentSchema = new Schema<IFeePayment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    busId: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
    transportId: { type: Schema.Types.ObjectId, ref: "StudentTransport" },
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
    collectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    notes: { type: String },
    feeGroupId: { type: Schema.Types.ObjectId, ref: "FeeGroup" },
    paymentType: { type: String, enum: ["single", "advance"], default: "single" }
  },
  { timestamps: true }
);

feePaymentSchema.index({ organizationId: 1, month: 1 });
feePaymentSchema.index(
  { organizationId: 1, studentId: 1, month: 1 },
  { unique: true }
);
feePaymentSchema.index({ organizationId: 1, busId: 1, month: 1 });
feePaymentSchema.index({ organizationId: 1, status: 1 });

export const FeePayment = model<IFeePayment>("FeePayment", feePaymentSchema);
