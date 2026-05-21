"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StudentFeeAssignment = void 0;
const mongoose_1 = require("mongoose");
const concessionSchema = new mongoose_1.Schema({
    feeHeadName: { type: String, required: true },
    concessionType: { type: String, enum: ["percentage", "fixed"], required: true },
    concessionValue: { type: Number, required: true },
    reason: { type: String, required: true }
}, { _id: false });
const studentFeeAssignmentSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    studentId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Student", required: true },
    feeStructureId: { type: mongoose_1.Schema.Types.ObjectId, ref: "FeeStructure", required: true },
    academicYear: { type: String, required: true },
    concessions: { type: [concessionSchema], default: [] },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
studentFeeAssignmentSchema.index({ organizationId: 1, studentId: 1, academicYear: 1 }, { unique: true });
studentFeeAssignmentSchema.index({ organizationId: 1, feeStructureId: 1 });
exports.StudentFeeAssignment = (0, mongoose_1.model)("StudentFeeAssignment", studentFeeAssignmentSchema);
