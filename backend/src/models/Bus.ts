import { model, Schema, type Document, type Types } from "mongoose";

export type BusStatus = "active" | "inactive";

export interface IBus extends Document {
  organizationId: Types.ObjectId;
  busNumber: string;
  routeName: string;
  /** Short route number shown on the live map (e.g. "R5"). Optional. */
  routeNumber?: string;
  driverName: string;
  driverPhone: string;
  capacity: number;
  status: BusStatus;
}

const busSchema = new Schema<IBus>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    busNumber: { type: String, required: true },
    routeName: { type: String, required: true },
    routeNumber: { type: String, trim: true, maxlength: 20 },
    driverName: { type: String, required: true },
    driverPhone: { type: String, required: true },
    capacity: { type: Number, required: true },
    status: { type: String, enum: ["active", "inactive"], default: "active" }
  },
  { timestamps: true }
);

busSchema.index({ organizationId: 1 });
busSchema.index({ organizationId: 1, status: 1 });
busSchema.index({ organizationId: 1, busNumber: 1 }, { unique: true });

export const Bus = model<IBus>("Bus", busSchema);
