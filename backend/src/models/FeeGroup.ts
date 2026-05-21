import { model, Schema, type Document, type Types } from "mongoose";

export interface IFeeGroup extends Document {
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  busId: Types.ObjectId;
  transportId?: Types.ObjectId;
  months: string[];
  totalAmount: number;
  totalDue: number;
  academicYear: string;
  collectedBy?: Types.ObjectId;
  collectedAt: Date;
  notes?: string;
  receiptNumber?: string;
}

const feeGroupSchema = new Schema<IFeeGroup>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    busId: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
    transportId: { type: Schema.Types.ObjectId, ref: "StudentTransport" },
    months: [{ type: String, required: true }],
    totalAmount: { type: Number, required: true },
    totalDue: { type: Number, required: true },
    academicYear: { type: String, required: true },
    collectedBy: { type: Schema.Types.ObjectId, ref: "User" },
    collectedAt: { type: Date, required: true },
    notes: { type: String },
    receiptNumber: { type: String }
  },
  { timestamps: true }
);

feeGroupSchema.index({ organizationId: 1, studentId: 1 });
feeGroupSchema.index({ organizationId: 1, collectedAt: -1 });

export const FeeGroup = model<IFeeGroup>("FeeGroup", feeGroupSchema);
