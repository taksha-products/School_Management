import { model, Schema, type Document, type Types } from "mongoose";

export type FeeHeadFrequency = "monthly" | "quarterly" | "annual" | "oneTime";
export type FeeHeadCategory = "academic" | "transport" | "facility" | "exam" | "other";

export interface IFeeHead {
  name: string;
  amount: number;
  frequency: FeeHeadFrequency;
  dueDay: number;
  isOptional: boolean;
  category: FeeHeadCategory;
}

export interface IFeeStructure extends Document {
  organizationId: Types.ObjectId;
  name: string;
  academicYear: string;
  applicableGrades: string[];
  feeHeads: IFeeHead[];
  isActive: boolean;
}

const feeHeadSchema = new Schema<IFeeHead>(
  {
    name: { type: String, required: true },
    amount: { type: Number, required: true },
    frequency: {
      type: String,
      enum: ["monthly", "quarterly", "annual", "oneTime"],
      required: true
    },
    dueDay: { type: Number, default: 10 },
    isOptional: { type: Boolean, default: false },
    category: {
      type: String,
      enum: ["academic", "transport", "facility", "exam", "other"],
      default: "academic"
    }
  },
  { _id: false }
);

const feeStructureSchema = new Schema<IFeeStructure>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true },
    academicYear: { type: String, required: true },
    applicableGrades: [{ type: String }],
    feeHeads: { type: [feeHeadSchema], required: true },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

feeStructureSchema.index({ organizationId: 1, isActive: 1 });
feeStructureSchema.index({ organizationId: 1, academicYear: 1 });

export const FeeStructure = model<IFeeStructure>("FeeStructure", feeStructureSchema);
