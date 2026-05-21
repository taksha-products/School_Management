import { model, Schema, type Document, type Types } from "mongoose";

export type ConcessionType = "percentage" | "fixed";

export interface IConcession {
  feeHeadName: string;
  concessionType: ConcessionType;
  concessionValue: number;
  reason: string;
}

export interface IStudentFeeAssignment extends Document {
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  feeStructureId: Types.ObjectId;
  academicYear: string;
  concessions: IConcession[];
  isActive: boolean;
}

const concessionSchema = new Schema<IConcession>(
  {
    feeHeadName: { type: String, required: true },
    concessionType: { type: String, enum: ["percentage", "fixed"], required: true },
    concessionValue: { type: Number, required: true },
    reason: { type: String, required: true }
  },
  { _id: false }
);

const studentFeeAssignmentSchema = new Schema<IStudentFeeAssignment>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    feeStructureId: { type: Schema.Types.ObjectId, ref: "FeeStructure", required: true },
    academicYear: { type: String, required: true },
    concessions: { type: [concessionSchema], default: [] },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

studentFeeAssignmentSchema.index(
  { organizationId: 1, studentId: 1, academicYear: 1 },
  { unique: true }
);
studentFeeAssignmentSchema.index({ organizationId: 1, feeStructureId: 1 });

export const StudentFeeAssignment = model<IStudentFeeAssignment>(
  "StudentFeeAssignment",
  studentFeeAssignmentSchema
);
