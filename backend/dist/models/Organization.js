"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Organization = void 0;
const mongoose_1 = require("mongoose");
const organizationSchema = new mongoose_1.Schema({
    name: { type: String, required: true },
    code: { type: String, required: true },
    address: { type: String },
    phone: { type: String },
    email: { type: String },
    logo: { type: String },
    plan: { type: String, enum: ["trial", "basic", "pro"], default: "trial" },
    isActive: { type: Boolean, default: true }
}, { timestamps: true });
organizationSchema.index({ code: 1 }, { unique: true });
organizationSchema.index({ isActive: 1 });
organizationSchema.index({ plan: 1 });
exports.Organization = (0, mongoose_1.model)("Organization", organizationSchema);
