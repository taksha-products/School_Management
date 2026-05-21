import { model, Schema, type Document, type Types } from "mongoose";

export type ExpenseCategory = "diesel" | "maintenance" | "other";

export interface IExpense extends Document {
  organizationId: Types.ObjectId;
  busId: Types.ObjectId;
  category: ExpenseCategory;
  amount: number;
  date: Date;
  vendor: string;
  notes?: string;
  academicYear: string;
  addedBy: Types.ObjectId;
  deleted: boolean;
}

const expenseSchema = new Schema<IExpense>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    busId: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
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
    addedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
    deleted: { type: Boolean, default: false }
  },
  { timestamps: true }
);

expenseSchema.index({ organizationId: 1, busId: 1, date: -1 });
expenseSchema.index({ organizationId: 1, date: -1 });
expenseSchema.index({ organizationId: 1, category: 1 });

export const Expense = model<IExpense>("Expense", expenseSchema);
