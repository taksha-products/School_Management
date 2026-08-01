"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RefreshToken = exports.getRefreshTokenExpiry = void 0;
const mongoose_1 = require("mongoose");
const REFRESH_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const refreshTokenSchema = new mongoose_1.Schema({
    token: { type: String, required: true, unique: true, index: true },
    userId: { type: mongoose_1.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    organizationId: { type: mongoose_1.Schema.Types.ObjectId, ref: "Organization", default: null },
    family: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    isRevoked: { type: Boolean, default: false, index: true },
    replacedByToken: { type: String, default: null },
    ipAddress: { type: String },
    userAgent: { type: String }
}, { timestamps: { createdAt: true, updatedAt: false } });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
refreshTokenSchema.index({ userId: 1, isRevoked: 1 });
refreshTokenSchema.statics.revokeFamily = async function revokeFamily(family) {
    await this.updateMany({ family, isRevoked: false }, { $set: { isRevoked: true } });
};
/** Default expiry for newly issued refresh tokens (30 days). */
const getRefreshTokenExpiry = () => new Date(Date.now() + REFRESH_TTL_MS);
exports.getRefreshTokenExpiry = getRefreshTokenExpiry;
exports.RefreshToken = (0, mongoose_1.model)("RefreshToken", refreshTokenSchema);
