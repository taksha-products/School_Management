import { model, Schema, type Document, type Types } from "mongoose";

export interface IGpsLog extends Document {
  organizationId: Types.ObjectId;
  deviceId: Types.ObjectId;
  busId: Types.ObjectId;
  lat: number;
  lng: number;
  speed: number;
  bearing: number;
  accuracy?: number;
  altitude?: number;
  satellites?: number;
  traccarEventTime: Date;
  receivedAt: Date;
  rawPayload?: unknown;
  createdAt: Date;
  updatedAt: Date;
}

export type GpsLogDocument = IGpsLog;

const gpsLogSchema = new Schema<IGpsLog>(
  {
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
    deviceId: { type: Schema.Types.ObjectId, ref: "GpsDevice", required: true },
    busId: { type: Schema.Types.ObjectId, ref: "Bus", required: true },
    lat: { type: Number, required: true, min: -90, max: 90 },
    lng: { type: Number, required: true, min: -180, max: 180 },
    speed: { type: Number, default: 0 },
    bearing: { type: Number, default: 0, min: 0, max: 360 },
    accuracy: { type: Number },
    altitude: { type: Number },
    satellites: { type: Number },
    traccarEventTime: { type: Date, required: true },
    receivedAt: { type: Date, default: Date.now },
    rawPayload: { type: Schema.Types.Mixed }
  },
  { timestamps: true }
);

gpsLogSchema.index({ deviceId: 1, traccarEventTime: -1 });
gpsLogSchema.index({ busId: 1, traccarEventTime: -1 });
gpsLogSchema.index({ organizationId: 1, traccarEventTime: -1 });
gpsLogSchema.index({ receivedAt: 1 }, { expireAfterSeconds: 2_592_000 });

export const GpsLog = model<IGpsLog>("GpsLog", gpsLogSchema);
