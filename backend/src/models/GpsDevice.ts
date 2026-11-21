import { model, Schema, type Document, type Types } from "mongoose";

export type GpsDeviceSyncStatus = "pending" | "synced" | "failed";

export interface IGpsDevice extends Document {
  organizationId: Types.ObjectId;
  busId: Types.ObjectId;
  /** Traccar's internal device id. Absent until the device is registered in Traccar. */
  traccarDeviceId?: number;
  /** The identifier the tracker reports (IMEI / phone id). Globally unique. */
  traccarUniqueId: string;
  name: string;
  isActive: boolean;
  syncStatus: GpsDeviceSyncStatus;
  syncError?: string;
  syncedAt?: Date;
  lastSeen?: Date;
  lastLat?: number;
  lastLng?: number;
  lastSpeed?: number;
  lastBearing?: number;
  lastAccuracy?: number;
  firmwareVersion?: string;
  batteryLevel?: number;
  createdAt: Date;
  updatedAt: Date;
}

export type GpsDeviceDocument = IGpsDevice;

const gpsDeviceSchema = new Schema<IGpsDevice>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    busId: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
    traccarDeviceId: { type: Number },
    traccarUniqueId: { type: String, required: true, trim: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
    syncStatus: { type: String, enum: ["pending", "synced", "failed"], default: "pending" },
    syncError: { type: String },
    syncedAt: { type: Date },
    lastSeen: { type: Date },
    lastLat: { type: Number },
    lastLng: { type: Number },
    lastSpeed: { type: Number },
    lastBearing: { type: Number, min: 0, max: 360 },
    lastAccuracy: { type: Number },
    firmwareVersion: { type: String },
    batteryLevel: { type: Number, min: 0, max: 100 }
  },
  { timestamps: true }
);

gpsDeviceSchema.index({ organizationId: 1, busId: 1 }, { unique: true });
gpsDeviceSchema.index({ traccarUniqueId: 1 }, { unique: true });
// Unique only once a Traccar id has been assigned (devices awaiting sync have none).
// `$exists: true` (not `$type`) so the planner can use this index for the webhook's
// equality lookup by Traccar id.
gpsDeviceSchema.index(
  { traccarDeviceId: 1 },
  { unique: true, partialFilterExpression: { traccarDeviceId: { $exists: true } } }
);
gpsDeviceSchema.index({ organizationId: 1, isActive: 1 });

export const GpsDevice = model<IGpsDevice>("GpsDevice", gpsDeviceSchema);
