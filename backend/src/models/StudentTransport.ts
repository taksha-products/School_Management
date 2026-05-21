import { model, Schema, type Document, type Types } from "mongoose";

export type StudentTransportStatus = "active" | "inactive";

export interface IStudentTransport extends Document {
  organizationId: Types.ObjectId;
  studentId: Types.ObjectId;
  busId: Types.ObjectId;
  monthlyTransportFee: number;
  pickupStop?: string;
  dropStop?: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  status: StudentTransportStatus;
  academicYear: string;
  addedBy?: Types.ObjectId;
}

const studentTransportSchema = new Schema<IStudentTransport>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: Schema.Types.ObjectId, ref: "Student", required: true },
    busId: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
    monthlyTransportFee: { type: Number, required: true, default: 1500 },
    pickupStop: { type: String },
    dropStop: { type: String },
    effectiveFrom: { type: Date, required: true, default: () => new Date() },
    effectiveTo: { type: Date, default: null },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    academicYear: { type: String, required: true },
    addedBy: { type: Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

studentTransportSchema.index({ organizationId: 1, studentId: 1, status: 1 });
studentTransportSchema.index({ organizationId: 1, busId: 1, status: 1 });
studentTransportSchema.index({ organizationId: 1, academicYear: 1, status: 1 });

// Only one active transport per student at a time
studentTransportSchema.index(
  { organizationId: 1, studentId: 1 },
  { unique: true, partialFilterExpression: { status: "active" } }
);

export const StudentTransport = model<IStudentTransport>(
  "StudentTransport",
  studentTransportSchema
);
