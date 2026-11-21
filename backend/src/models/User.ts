import { model, Schema, type Document, type Types } from "mongoose";

export type UserRole = "superAdmin" | "orgAdmin" | "staff" | "parent";

export interface StaffPermissions {
  canCollectFees: boolean;
  canManageStudents: boolean;
  canViewReports: boolean;
  canManageBuses: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  /** Normalized 10-digit Indian mobile; required for parent phone-OTP login. */
  phone?: string;
  passwordHash: string;
  role: UserRole;
  organizationId: Types.ObjectId | null;
  staffPermissions?: StaffPermissions;
  parentStudentIds?: Types.ObjectId[];
  isActive: boolean;
  twoFactorSecret?: string;
  twoFactorEnabled: boolean;
  twoFactorVerifiedAt?: Date;
  backupCodes?: string[];
}

const staffPermissionsSchema = new Schema<StaffPermissions>(
  {
    canCollectFees: { type: Boolean, default: false },
    canManageStudents: { type: Boolean, default: false },
    canViewReports: { type: Boolean, default: false },
    canManageBuses: { type: Boolean, default: false }
  },
  { _id: false }
);

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    phone: { type: String, trim: true },
    passwordHash: { type: String, required: true },
    role: {
      type: String,
      enum: ["superAdmin", "orgAdmin", "staff", "parent"],
      required: true
    },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", default: null },
    staffPermissions: { type: staffPermissionsSchema },
    parentStudentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    isActive: { type: Boolean, default: true },
    twoFactorSecret: { type: String, select: false },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorVerifiedAt: { type: Date },
    backupCodes: { type: [String], select: false }
  },
  { timestamps: true }
);

userSchema.index({ email: 1 }, { unique: true });
/** Parent/staff phone is unique per organization (not globally). */
userSchema.index(
  { organizationId: 1, phone: 1 },
  {
    unique: true,
    partialFilterExpression: { phone: { $type: "string" }, organizationId: { $type: "objectId" } }
  }
);
userSchema.index({ organizationId: 1, role: 1 });
userSchema.index({ organizationId: 1, isActive: 1 });
userSchema.index({ organizationId: 1, role: 1, phone: 1 });
userSchema.index({ parentStudentIds: 1 });

export const User = model<IUser>("User", userSchema);
