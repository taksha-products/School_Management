import { model, Schema, type Document, type Model, type Types } from "mongoose";

export interface IRefreshToken extends Document {
  token: string;
  userId: Types.ObjectId;
  organizationId: Types.ObjectId | null;
  family: string;
  expiresAt: Date;
  isRevoked: boolean;
  replacedByToken: string | null;
  createdAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

export interface RefreshTokenModel extends Model<IRefreshToken> {
  revokeFamily(family: string): Promise<void>;
}

const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

const refreshTokenSchema = new Schema<IRefreshToken, RefreshTokenModel>(
  {
    token: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
    organizationId: { type: Schema.Types.ObjectId, ref: "Organization", default: null },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    isRevoked: { type: Boolean, default: false, index: true },
    replacedByToken: { type: String, default: null },
    ipAddress: { type: String },
    userAgent: { type: String }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });

refreshTokenSchema.statics.revokeFamily = async function revokeFamily(
  family: string
): Promise<void> {
  await this.updateMany({ family, isRevoked: false }, { $set: { isRevoked: true } });
};

/** Default expiry for newly issued refresh tokens (30 days). */
export const getRefreshTokenExpiry = (): Date => new Date(Date.now() + REFRESH_TTL_MS);

export const RefreshToken = model<IRefreshToken, RefreshTokenModel>(
  "RefreshToken",
  refreshTokenSchema
);
