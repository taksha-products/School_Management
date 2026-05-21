"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Student = void 0;
const mongoose_1 = require("mongoose");
const studentSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    name: { type: String, required: true },
    grade: { type: String, required: true },
    parentName: { type: String, required: true },
    parentPhone: { type: String, required: true },
    address: { type: String },
    busId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Bus", required: true },
    monthlyFee: { type: Number, required: true, default: 1500 },
    status: { type: String, enum: ["active", "inactive"], default: "active" },
    academicYear: { type: String, required: true }
}, { timestamps: true });
studentSchema.index({ organizationId: 1, status: 1 });
studentSchema.index({ organizationId: 1, busId: 1 });
studentSchema.index({ organizationId: 1, grade: 1 });
studentSchema.index({ organizationId: 1, name: "text" }, {
    weights: { name: 10 }
});
exports.Student = (0, mongoose_1.model)("Student", studentSchema);
