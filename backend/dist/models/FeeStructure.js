"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.FeeStructure = void 0;
const mongoose_1 = require("mongoose");
const feeHeadSchema = new mongoose_1.Schema({
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
}, { _id: false });
const feeStructureSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true },
    academicYear: { type: String, required: true },
    applicableGrades: [{ type: String }],
    feeHeads: { type: [feeHeadSchema], required: true },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
feeStructureSchema.index({ organizationId: 1, isActive: 1 });
feeStructureSchema.index({ organizationId: 1, academicYear: 1 });
exports.FeeStructure = (0, mongoose_1.model)("FeeStructure", feeStructureSchema);
