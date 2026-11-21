import crypto from "crypto";
import jwt, { type JwtPayload } from "jsonwebtoken";

import type { IUser, StaffPermissions } from "../models/User";
import { ACCESS_TOKEN_MAX_AGE_SECONDS, PRE_AUTH_MAX_AGE_SECONDS } from "./authConstants";
import { hashToken } from "./tokenHash";

export interface AccessTokenPayload {
  userId: string;
  organizationId: string | null;
  role: string;
  name: string;
  phone?: string;
  staffPermissions?: StaffPermissions;
  parentStudentIds?: string[];
  permissions?: StaffPermissions;
  iat: number;
  exp: number;
}

const PRE_AUTH_TOKEN_TTL = PRE_AUTH_MAX_AGE_SECONDS;

export interface PreAuthTokenPayload {
  userId: string;
  phase: "pre-auth";
  iat: number;
  exp: number;
}

const getJwtSecret = (): string => {
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
export const assertRefreshSecretConfigured = (): void => {
  const refreshSecret = process.env.JWT_REFRESH_SECRET;
  const jwtSecret = process.env.JWT_SECRET;
  if (!refreshSecret) {
    throw new Error("JWT refresh secret is not configured");
  }
  if (jwtSecret && refreshSecret === jwtSecret) {
    throw new Error("JWT_REFRESH_SECRET must differ from JWT_SECRET");
  }
};

/**
 * Signs a short-lived access token (see ACCESS_TOKEN_MAX_AGE_SECONDS).
 */
export const generateAccessToken = (user: IUser): string => {
  const payload = {
    userId: user._id.toString(),
    organizationId: user.organizationId ? user.organizationId.toString() : null,
    role: user.role,
    name: user.name,
    phone: user.phone,
    staffPermissions: user.staffPermissions,
    parentStudentIds: user.parentStudentIds?.map((id) => id.toString()),
    permissions: user.staffPermissions
  };

  return jwt.sign(payload, getJwtSecret(), { expiresIn: ACCESS_TOKEN_MAX_AGE_SECONDS });
};

export interface GeneratedRefreshToken {
  raw: string;
  hashed: string;
  family: string;
}

/**
 * Generates an opaque refresh token and its SHA-256 hash.
 * Reuses `existingFamily` when rotating within the same session family.
 */
export const generateRefreshToken = (existingFamily?: string): GeneratedRefreshToken => {
  const raw = crypto.randomBytes(64).toString("hex");
  const hashed = hashToken(raw);
  const family = existingFamily ?? crypto.randomUUID();

  return { raw, hashed, family };
};

/**
 * Verifies an access token and returns its payload.
 * @throws jwt.JsonWebTokenError | jwt.TokenExpiredError
 */
export const verifyAccessToken = (token: string): AccessTokenPayload => {
  const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload & Omit<AccessTokenPayload, "iat" | "exp">;

  return {
    userId: decoded.userId,
    organizationId: decoded.organizationId ?? null,
    role: decoded.role,
    name: decoded.name,
    phone: decoded.phone,
    staffPermissions: decoded.staffPermissions,
    parentStudentIds: decoded.parentStudentIds,
    permissions: decoded.permissions,
    iat: decoded.iat ?? 0,
    exp: decoded.exp ?? 0
  };
};

/**
 * Signs a short-lived pre-authentication token for the 2FA verification step.
 */
export const generatePreAuthToken = (userId: string): string =>
  jwt.sign({ userId, phase: "pre-auth" }, getJwtSecret(), { expiresIn: PRE_AUTH_TOKEN_TTL });

/**
 * Verifies a pre-auth JWT and ensures it has the correct phase.
 * @throws jwt.JsonWebTokenError | jwt.TokenExpiredError
 */
export const verifyPreAuthToken = (token: string): PreAuthTokenPayload => {
  const decoded = jwt.verify(token, getJwtSecret()) as JwtPayload & {
    userId: string;
    phase: string;
  };

  if (decoded.phase !== "pre-auth") {
    throw new jwt.JsonWebTokenError("Invalid pre-auth token phase");
  }

  return {
    userId: decoded.userId,
    phase: "pre-auth",
    iat: decoded.iat ?? 0,
    exp: decoded.exp ?? 0
  };
};
