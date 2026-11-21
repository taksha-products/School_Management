import { model, Schema, type Document, type Types } from "mongoose";

export interface INotificationRead extends Document {
  organizationId: Types.ObjectId;
  notificationId: Types.ObjectId;
  userId: Types.ObjectId;
  readAt: Date;
}

const notificationReadSchema = new Schema<INotificationRead>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    notificationId: { type: Schema.Types.ObjectId, ref: "Notification", required: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true },
    readAt: { type: Date, default: Date.now }
  },
  { timestamps: false }
);

notificationReadSchema.index({ userId: 1, notificationId: 1 }, { unique: true });
notificationReadSchema.index({ organizationId: 1, userId: 1 });

export const NotificationRead = model<INotificationRead>(
  "NotificationRead",
  notificationReadSchema
);
