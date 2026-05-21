import { model, Schema, type Document } from "mongoose";

export type OrganizationPlan = "trial" | "basic" | "pro";

export interface IOrganization extends Document {
  name: string;
  code: string;
  address?: string;
  phone?: string;
  email?: string;
  logo?: string;
  plan: OrganizationPlan;
  isActive: boolean;
  currentAcademicYear?: string;
}

const organizationSchema = new Schema<IOrganization>(
  {
    name: { type: String, required: true },
    code: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    logo: { type: String },
    plan: { type: String, enum: ["trial", "basic", "pro"], default: "trial" },
    isActive: { type: Boolean, default: true },
    currentAcademicYear: { type: String, default: "2025-26" }
  },
  { timestamps: true }
);

organizationSchema.index({ code: 1 }, { unique: true });
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ plan: 1 });

export const Organization = model<IOrganization>("Organization", organizationSchema);
