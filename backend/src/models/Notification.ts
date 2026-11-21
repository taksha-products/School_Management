import { model, Schema, type Document, type Types } from "mongoose";

export type NotificationType =
  | "general"
  | "announcement"
  | "fee"
  | "bus"
  | "marks"
  | "other";

export interface INotification extends Document {
  organizationId: Types.ObjectId;
  title: string;
  body: string;
  type: NotificationType;
  /** Empty = all parents in the org; otherwise only parents of these students. */
  studentIds: Types.ObjectId[];
  createdBy: Types.ObjectId | null;
  publishedAt: Date;
  isActive: boolean;
}

const notificationSchema = new Schema<INotification>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true, trim: true, maxlength: 4000 },
    type: {
      type: String,
      enum: ["general", "announcement", "fee", "bus", "marks", "other"],
      default: "general"
    },
    studentIds: [{ type: Schema.Types.ObjectId, ref: "Student" }],
    createdBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
    publishedAt: { type: Date, default: Date.now },
    isActive: { type: Boolean, default: true }
  },
  { timestamps: true }
);

notificationSchema.index({ organizationId: 1, publishedAt: -1 });
notificationSchema.index({ organizationId: 1, isActive: 1, publishedAt: -1 });
notificationSchema.index({ organizationId: 1, studentIds: 1 });

export const Notification = model<INotification>("Notification", notificationSchema);
