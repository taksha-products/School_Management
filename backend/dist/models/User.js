"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.User = void 0;
const mongoose_1 = require("mongoose");
const staffPermissionsSchema = new mongoose_1.Schema({
    canCollectFees: { type: Boolean, default: false },
    canManageStudents: { type: Boolean, default: false },
    canViewReports: { type: Boolean, default: false },
    canManageBuses: { type: Boolean, default: false }
}, { _id: false });
const userSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    email: { type: String, required: true, lowercase: true },
    passwordHash: { type: String, required: true },
    role: {
        type: String,
        enum: ["superAdmin", "orgAdmin", "staff", "parent"],
        required: true
    },
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", default: null },
    staffPermissions: { type: staffPermissionsSchema },
    parentStudentIds: [{ type: mongoose_1.Schema.Types.ObjectId, ref: "Student" }],
    isActive: { type: Boolean, default: true },
    twoFactorSecret: { type: String, select: false },
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorVerifiedAt: { type: Date },
    backupCodes: { type: [String], select: false }
}, { timestamps: true });
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ organizationId: 1, role: 1 });
userSchema.index({ organizationId: 1, isActive: 1 });
userSchema.index({ parentStudentIds: 1 });
exports.User = (0, mongoose_1.model)("User", userSchema);
