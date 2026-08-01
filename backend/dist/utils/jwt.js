"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyPreAuthToken = exports.generatePreAuthToken = exports.verifyAccessToken = exports.generateRefreshToken = exports.generateAccessToken = exports.assertRefreshSecretConfigured = void 0;
const crypto_1 = __importDefault(require("crypto"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const authConstants_1 = require("./authConstants");
const tokenHash_1 = require("./tokenHash");
const PRE_AUTH_TOKEN_TTL = authConstants_1.PRE_AUTH_MAX_AGE_SECONDS;
const getJwtSecret = () => {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
        throw new Error("JWT secret is not configured");
    }
    return secret;
};
/**
 * Validates that JWT_REFRESH_SECRET is set and differs from JWT_SECRET.
 * Refresh tokens are opaque (not JWT), but both secrets must be configured.
 */
const assertRefreshSecretConfigured = () => {
    const refreshSecret = process.env.JWT_REFRESH_SECRET;
    const jwtSecret = process.env.JWT_SECRET;
    if (!refreshSecret) {
        throw new Error("JWT refresh secret is not configured");
    }
    if (jwtSecret && refreshSecret === jwtSecret) {
        throw new Error("JWT_REFRESH_SECRET must differ from JWT_SECRET");
    }
};
exports.assertRefreshSecretConfigured = assertRefreshSecretConfigured;
/**
 * Signs a short-lived access token (see ACCESS_TOKEN_MAX_AGE_SECONDS).
 */
const generateAccessToken = (user) => {
    const payload = {
        userId: user._id.toString(),
        organizationId: user.organizationId ? user.organizationId.toString() : null,
        role: user.role,
        name: user.name,
        staffPermissions: user.staffPermissions,
        parentStudentIds: user.parentStudentIds?.map((id) => id.toString()),
        permissions: user.staffPermissions
    };
    return jsonwebtoken_1.default.sign(payload, getJwtSecret(), { expiresIn: authConstants_1.ACCESS_TOKEN_MAX_AGE_SECONDS });
};
exports.generateAccessToken = generateAccessToken;
/**
 * Generates an opaque refresh token and its SHA-256 hash.
 * Reuses `existingFamily` when rotating within the same session family.
 */
const generateRefreshToken = (existingFamily) => {
    const raw = crypto_1.default.randomBytes(64).toString("hex");
    const hashed = (0, tokenHash_1.hashToken)(raw);
    const family = existingFamily ?? crypto_1.default.randomUUID();
    return { raw, hashed, family };
};
exports.generateRefreshToken = generateRefreshToken;
/**
 * Verifies an access token and returns its payload.
 * @throws jwt.JsonWebTokenError | jwt.TokenExpiredError
 */
const verifyAccessToken = (token) => {
    const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret());
    return {
        userId: decoded.userId,
        organizationId: decoded.organizationId ?? null,
        role: decoded.role,
        name: decoded.name,
        staffPermissions: decoded.staffPermissions,
        parentStudentIds: decoded.parentStudentIds,
        permissions: decoded.permissions,
        iat: decoded.iat ?? 0,
        exp: decoded.exp ?? 0
    };
};
exports.verifyAccessToken = verifyAccessToken;
/**
 * Signs a short-lived pre-authentication token for the 2FA verification step.
 */
const generatePreAuthToken = (userId) => jsonwebtoken_1.default.sign({ userId, phase: "pre-auth" }, getJwtSecret(), { expiresIn: PRE_AUTH_TOKEN_TTL });
exports.generatePreAuthToken = generatePreAuthToken;
/**
 * Verifies a pre-auth JWT and ensures it has the correct phase.
 * @throws jwt.JsonWebTokenError | jwt.TokenExpiredError
 */
const verifyPreAuthToken = (token) => {
    const decoded = jsonwebtoken_1.default.verify(token, getJwtSecret());
    if (decoded.phase !== "pre-auth") {
        throw new jsonwebtoken_1.default.JsonWebTokenError("Invalid pre-auth token phase");
    }
    return {
        userId: decoded.userId,
        phase: "pre-auth",
        iat: decoded.iat ?? 0,
        exp: decoded.exp ?? 0
    };
};
exports.verifyPreAuthToken = verifyPreAuthToken;
