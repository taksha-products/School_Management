import crypto from "crypto";

import { redisClient, isRedisReady } from "../config/redis";
import { hashToken } from "./tokenHash";

const OTP_TTL_SECONDS = Number(process.env.OTP_TTL_SECONDS ?? 5 * 60);
const OTP_RESEND_COOLDOWN_SECONDS = Number(process.env.OTP_RESEND_COOLDOWN_SECONDS ?? 60);
const OTP_MAX_ATTEMPTS = Number(process.env.OTP_MAX_ATTEMPTS ?? 5);
const OTP_REQUEST_WINDOW_SECONDS = 15 * 60;
const OTP_MAX_REQUESTS_PER_PHONE = Number(process.env.OTP_MAX_REQUESTS_PER_PHONE ?? 5);
const SCHOOL_SELECT_TTL_SECONDS = 5 * 60;

/** Phone-scoped OTP (same parent phone may map to multiple org accounts). */
const otpKey = (phone: string): string => `taksha:otp:parent:phone:${phone}`;
const cooldownKey = (phone: string): string => `taksha:otp:cooldown:phone:${phone}`;
const requestCountKey = (phone: string): string => `taksha:otp:req:phone:${phone}`;
const schoolSelectKey = (token: string): string => `taksha:otp:school-select:${token}`;

export interface StoredOtpPayload {
  hash: string;
  attempts: number;
  /** Candidate parent user IDs across one or more organizations. */
  parentUserIds: string[];
}

export interface SchoolSelectionPayload {
  phone: string;
  parentUserIds: string[];
}

/**
 * Generates a cryptographically random 6-digit OTP.
 */
export const generateOtpCode = (): string => {
  const n = crypto.randomInt(0, 1_000_000);
  return String(n).padStart(6, "0");
};

/**
 * Returns whether a new OTP can be sent for this phone.
 */
export const canRequestOtp = async (
  phone: string
): Promise<{ allowed: boolean; retryAfterSeconds?: number; reason?: string }> => {
  if (!isRedisReady()) {
    return { allowed: false, reason: "OTP service temporarily unavailable" };
  }

  const cooldownTtl = await redisClient.ttl(cooldownKey(phone));
  if (cooldownTtl > 0) {
    return {
      allowed: false,
      retryAfterSeconds: cooldownTtl,
      reason: "Please wait before requesting another OTP"
    };
  }

  const requestCount = Number((await redisClient.get(requestCountKey(phone))) ?? "0");
  if (requestCount >= OTP_MAX_REQUESTS_PER_PHONE) {
    const windowTtl = await redisClient.ttl(requestCountKey(phone));
    return {
      allowed: false,
      retryAfterSeconds: windowTtl > 0 ? windowTtl : OTP_REQUEST_WINDOW_SECONDS,
      reason: "Too many OTP requests. Try again later."
    };
  }

  return { allowed: true };
};

/**
 * Stores a hashed OTP for a phone with all matching parent account IDs.
 */
export const storeParentOtp = async (
  phone: string,
  otp: string,
  parentUserIds: string[]
): Promise<void> => {
  if (!isRedisReady()) {
    throw new Error("OTP service temporarily unavailable");
  }

  const payload: StoredOtpPayload = {
    hash: hashToken(otp),
    attempts: 0,
    parentUserIds
  };

  const pipeline = redisClient.pipeline();
  pipeline.set(otpKey(phone), JSON.stringify(payload), "EX", OTP_TTL_SECONDS);
  pipeline.set(cooldownKey(phone), "1", "EX", OTP_RESEND_COOLDOWN_SECONDS);
  pipeline.incr(requestCountKey(phone));
  const results = await pipeline.exec();

  const incrResult = results?.[2]?.[1];
  const count = typeof incrResult === "number" ? incrResult : Number(incrResult ?? 0);
  if (count === 1) {
    await redisClient.expire(requestCountKey(phone), OTP_REQUEST_WINDOW_SECONDS);
  }
};

const getStoredParentOtp = async (phone: string): Promise<StoredOtpPayload | null> => {
  if (!isRedisReady()) {
    return null;
  }
  const raw = await redisClient.get(otpKey(phone));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as StoredOtpPayload;
  } catch {
    return null;
  }
};

const incrementOtpAttempts = async (phone: string): Promise<boolean> => {
  const stored = await getStoredParentOtp(phone);
  if (!stored) {
    return true;
  }
  stored.attempts += 1;
  const ttl = await redisClient.ttl(otpKey(phone));
  const expireSeconds = ttl > 0 ? ttl : OTP_TTL_SECONDS;
  await redisClient.set(otpKey(phone), JSON.stringify(stored), "EX", expireSeconds);
  return stored.attempts >= OTP_MAX_ATTEMPTS;
};

/**
 * Verifies OTP for a phone and returns candidate parent user IDs.
 */
export const verifyStoredParentOtp = async (
  phone: string,
  otp: string
): Promise<
  { ok: true; payload: StoredOtpPayload } | { ok: false; code: string; message: string }
> => {
  if (!isRedisReady()) {
    return { ok: false, code: "OTP_UNAVAILABLE", message: "OTP service temporarily unavailable" };
  }

  const stored = await getStoredParentOtp(phone);
  if (!stored) {
    return { ok: false, code: "OTP_EXPIRED", message: "OTP expired or not requested" };
  }

  if (stored.attempts >= OTP_MAX_ATTEMPTS) {
    await clearParentOtp(phone);
    return {
      ok: false,
      code: "OTP_LOCKED",
      message: "Too many invalid attempts. Request a new OTP."
    };
  }

  if (stored.hash !== hashToken(otp)) {
    const exceeded = await incrementOtpAttempts(phone);
    if (exceeded) {
      await clearParentOtp(phone);
      return {
        ok: false,
        code: "OTP_LOCKED",
        message: "Too many invalid attempts. Request a new OTP."
      };
    }
    return { ok: false, code: "OTP_INVALID", message: "Invalid OTP" };
  }

  return { ok: true, payload: stored };
};

export const clearParentOtp = async (phone: string): Promise<void> => {
  if (!isRedisReady()) {
    return;
  }
  await redisClient.del(otpKey(phone));
};

/**
 * Creates a short-lived school-selection token after OTP verify when multiple schools match.
 */
export const createSchoolSelectionToken = async (
  phone: string,
  parentUserIds: string[]
): Promise<string> => {
  if (!isRedisReady()) {
    throw new Error("OTP service temporarily unavailable");
  }
  const token = crypto.randomBytes(32).toString("hex");
  const payload: SchoolSelectionPayload = { phone, parentUserIds };
  await redisClient.set(
    schoolSelectKey(token),
    JSON.stringify(payload),
    "EX",
    SCHOOL_SELECT_TTL_SECONDS
  );
  return token;
};

export const consumeSchoolSelectionToken = async (
  token: string
): Promise<SchoolSelectionPayload | null> => {
  if (!isRedisReady()) {
    return null;
  }
  const key = schoolSelectKey(token);
  const raw = await redisClient.get(key);
  if (!raw) {
    return null;
  }
  await redisClient.del(key);
  try {
    return JSON.parse(raw) as SchoolSelectionPayload;
  } catch {
    return null;
  }
};

export const OTP_CONFIG = {
  ttlSeconds: OTP_TTL_SECONDS,
  resendCooldownSeconds: OTP_RESEND_COOLDOWN_SECONDS,
  maxAttempts: OTP_MAX_ATTEMPTS,
  schoolSelectTtlSeconds: SCHOOL_SELECT_TTL_SECONDS
} as const;
