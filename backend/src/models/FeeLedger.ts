import { model, Schema, type Document, type Types } from "mongoose";

export type FeeLedgerStatus = "paid" | "partial" | "pending" | "overdue";

export interface IFeeLedger extends Document {
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  feeStructureId?: Types.ObjectId;
  feeHeadName: string;
  periodLabel: string;
  amountDue: number;
  amountPaid: number;
  lateFee: number;
  status: FeeLedgerStatus;
  dueDate?: Date;
  paymentId?: Types.ObjectId;
  academicYear: string;
}

const feeLedgerSchema = new Schema<IFeeLedger>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    feeStructureId: { type: Schema.Types.ObjectId, ref: "FeeStructure" },
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
    paymentId: { type: Schema.Types.ObjectId, ref: "SchoolFeePayment" },
    academicYear: { type: String, required: true }
  },
  { timestamps: true }
);

feeLedgerSchema.index({ organizationId: 1, studentId: 1, academicYear: 1 });
feeLedgerSchema.index(
  { organizationId: 1, studentId: 1, feeHeadName: 1, periodLabel: 1 },
  { unique: true }
);
feeLedgerSchema.index({ organizationId: 1, status: 1, dueDate: 1 });
feeLedgerSchema.index({ organizationId: 1, academicYear: 1, status: 1 });

export const FeeLedger = model<IFeeLedger>("FeeLedger", feeLedgerSchema);
