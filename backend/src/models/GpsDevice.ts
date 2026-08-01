import { model, Schema, type Document, type Types } from "mongoose";

export interface IGpsDevice extends Document {
  organizationId: Types.ObjectId;
  busId: Types.ObjectId;
  traccarDeviceId: number;
  traccarUniqueId: string;
  name: string;
  isActive: boolean;
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
    traccarDeviceId: { type: Number, required: true },
    traccarUniqueId: { type: String, required: true },
    name: { type: String, required: true },
    isActive: { type: Boolean, default: true },
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
gpsDeviceSchema.index({ traccarDeviceId: 1 }, { unique: true });
gpsDeviceSchema.index({ organizationId: 1, isActive: 1 });

export const GpsDevice = model<IGpsDevice>("GpsDevice", gpsDeviceSchema);
