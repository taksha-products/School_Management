"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Expense = void 0;
const mongoose_1 = require("mongoose");
const expenseSchema = new mongoose_1.Schema({
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", required: true },
    busId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Bus", required: true },
    category: {
        type: String,
        enum: ["diesel", "maintenance", "other"],
        required: true
    },
    amount: { type: Number, required: true },
    date: { type: Date, required: true },
    vendor: { type: String, required: true },
    notes: { type: String },
    academicYear: { type: String, required: true },
    addedBy: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true },
    deleted: { type: Boolean, default: false }
}, { timestamps: true });
expenseSchema.index({ organizationId: 1, busId: 1, date: -1 });
expenseSchema.index({ organizationId: 1, date: -1 });
expenseSchema.index({ organizationId: 1, category: 1 });
exports.Expense = (0, mongoose_1.model)("Expense", expenseSchema);
