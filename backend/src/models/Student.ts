import { model, Schema, type Document, type Types } from "mongoose";

export type StudentStatus = "active" | "inactive";

export interface IStudent extends Document {
  organizationId: Types.ObjectId;
  admissionNo?: string;
  name: string;
  grade: string;
  section?: string;
  parentName: string;
  parentPhone: string;
  /** Linked parent User account (auto-provisioned on create/update). */
  parentUserId?: Types.ObjectId;
  address?: string;
  status: StudentStatus;
  academicYear: string;
}

const studentSchema = new Schema<IStudent>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    admissionNo: { type: String, trim: true },
    name: { type: String, required: true },
    grade: { type: String, required: true },
    section: { type: String, trim: true },
    parentName: { type: String, required: true },
    parentPhone: { type: String, required: true },
    parentUserId: { type: Schema.Types.ObjectId, ref: "User" },
    address: { type: String },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    academicYear: { type: String, required: true }
  },
  { timestamps: true }
);

studentSchema.index({ organizationId: 1, status: 1 });
studentSchema.index({ organizationId: 1, grade: 1 });
studentSchema.index({ organizationId: 1, parentPhone: 1 });
studentSchema.index({ parentUserId: 1 });
studentSchema.index(
  { organizationId: 1, admissionNo: 1 },
  {
    unique: true,
    partialFilterExpression: { admissionNo: { $type: "string" } }
  }
);
studentSchema.index(
  { organizationId: 1, name: "text" },
  {
    weights: { name: 10 }
  }
);

export const Student = model<IStudent>("Student", studentSchema);
