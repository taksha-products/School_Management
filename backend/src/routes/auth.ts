import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { blockSuperAdmin2FADisable } from "../middleware/require2FA";
import { validate } from "../middleware/validate";
import { Organization } from "../models/Organization";
import { getOrgBrandingLabel } from "../services/orgThemeService";
import { sendParentLoginOtp } from "../services/sms";
import { getRefreshTokenExpiry, RefreshToken } from "../models/RefreshToken";
import { User, type IUser } from "../models/User";
import { isMobileApiClient } from "../utils/apiClient";
import { asyncHandler } from "../utils/asyncHandler";
import { clearAuthCookies, clearPreAuthCookie, setAuthCookies, setPreAuthCookie } from "../utils/authCookies";
import {
  assertRefreshSecretConfigured,
  generateAccessToken,
  generatePreAuthToken,
  generateRefreshToken,
  verifyPreAuthToken
} from "../utils/jwt";
import {
  canRequestOtp,
  clearParentOtp,
  consumeSchoolSelectionToken,
  createSchoolSelectionToken,
  generateOtpCode,
  OTP_CONFIG,
  storeParentOtp,
  verifyStoredParentOtp
} from "../utils/otpRedis";
import { normalizeIndianMobile } from "../utils/phone";
import { hashToken } from "../utils/tokenHash";
import {
  decryptSecretFromStorage,
  encryptSecretForStorage,
  generateBackupCodes,
  generateQRCode,
  generateSecret,
  isBackupCodeFormat,
  verifyBackupCode,
  verifyToken
} from "../utils/totp";
import {
  clear2FAAttempts,
  deletePendingTotpSecret,
  getPendingTotpSecret,
  is2FAAttemptsExceeded,
  setPendingTotpSecret
} from "../utils/twoFactorRedis";
import { TWO_FACTOR_VERIFICATION_MAX_AGE_MS } from "../constants/twoFactor";
import {
  loginValidation,
  otpRequestValidation,
  otpSelectSchoolValidation,
  otpVerifyValidation
} from "../validators/auth";
import { Types } from "mongoose";
import { Student } from "../models/Student";

const authRouter = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many login attempts." }
});

const refreshLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many refresh attempts." }
});

const otpRequestLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP requests. Try again later." }
});

const otpVerifyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: "Too many OTP verification attempts." }
});

interface PublicUser {
  id: string;
  name: string;
  email: string;
  phone?: string;
  role: IUser["role"];
  organizationId: string | null;
  permissions?: IUser["staffPermissions"];
  parentStudentIds?: string[];
}

interface IssuedSession {
  user: PublicUser;
  accessToken?: string;
  refreshToken?: string;
}

const toPublicUser = (user: IUser): PublicUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  phone: user.phone,
  role: user.role,
  organizationId: user.organizationId ? user.organizationId.toString() : null,
  permissions: user.staffPermissions,
  parentStudentIds: user.parentStudentIds?.map((id) => id.toString())
});

/**
 * Reads the refresh token from httpOnly cookie (web) or JSON body (mobile).
 */
const extractRefreshTokenRaw = (req: AuthenticatedRequest): string | undefined => {
  const cookieToken = req.cookies?.refresh_token as string | undefined;
  if (cookieToken) {
    return cookieToken;
  }

  if (isMobileApiClient(req)) {
    const bodyToken = (req.body as { refreshToken?: unknown } | undefined)?.refreshToken;
    return typeof bodyToken === "string" ? bodyToken : undefined;
  }

  return undefined;
};

const getClientIp = (req: AuthenticatedRequest): string => {
  const forwarded = req.headers["x-forwarded-for"];
  if (typeof forwarded === "string" && forwarded.length > 0) {
    return forwarded.split(",")[0]?.trim() ?? "";
  }
  return req.socket.remoteAddress ?? "";
};

const persistRefreshToken = async (
  user: IUser,
  hashed: string,
  family: string,
  req: AuthenticatedRequest
): Promise<void> => {
  await RefreshToken.create({
    token: hashed,
    userId: user._id,
    organizationId: user.organizationId,
    family,
    expiresAt: getRefreshTokenExpiry(),
    isRevoked: false,
    replacedByToken: null,
    ipAddress: getClientIp(req),
    userAgent: req.headers["user-agent"] ?? ""
  });
};

/**
 * Issues access + refresh tokens.
 * Web: sets httpOnly cookies.
 * Mobile (`x-api-client: mobile`): returns tokens in the response body for Bearer auth.
 */
const issueSession = async (
  user: IUser,
  req: AuthenticatedRequest,
  res: Parameters<typeof setAuthCookies>[0],
  updateTwoFactorVerified = false
): Promise<IssuedSession> => {
  assertRefreshSecretConfigured();

  if (updateTwoFactorVerified) {
    user.twoFactorVerifiedAt = new Date();
    await user.save();
  }

  const accessToken = generateAccessToken(user);
  const refresh = generateRefreshToken();
  await persistRefreshToken(user, refresh.hashed, refresh.family, req);

  const publicUser = toPublicUser(user);

  if (isMobileApiClient(req)) {
    return {
      user: publicUser,
      accessToken,
      refreshToken: refresh.raw
    };
  }

  setAuthCookies(res, accessToken, refresh.raw);
  return { user: publicUser };
};

const sessionResponseBody = (session: IssuedSession, extra: Record<string, unknown> = {}) => ({
  success: true,
  user: session.user,
  ...(session.accessToken && session.refreshToken
    ? {
        accessToken: session.accessToken,
        refreshToken: session.refreshToken,
        tokenType: "Bearer" as const,
        expiresIn: Number(process.env.ACCESS_TOKEN_MAX_AGE_SECONDS ?? 8 * 60 * 60)
      }
    : {}),
  ...extra
});

const getOrganizationName = async (user: IUser): Promise<string> => {
  if (!user.organizationId) {
    return "TAKSHA";
  }
  return getOrgBrandingLabel(user.organizationId.toString());
};

const logSuspiciousEvent = (
  event: string,
  details: Record<string, string | undefined>
): void => {
  console.warn({
    type: "auth_security",
    event,
    timestamp: new Date().toISOString(),
    ...details
  });
};

authRouter.post(
  "/login",
  loginLimiter,
  loginValidation,
  validate,
  asyncHandler(async (req, res) => {
    const { email, password } = req.body as { email: string; password: string };

    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
      return;
    }

    const passwordMatched = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatched) {
      res.status(401).json({
        success: false,
        message: "Invalid credentials"
      });
      return;
    }

    // Parents authenticate only via mobile OTP — never email/password.
    if (user.role === "parent") {
      res.status(403).json({
        success: false,
        message: "Parents sign in with mobile number OTP only",
        code: "PARENT_OTP_REQUIRED"
      });
      return;
    }

    if (user.organizationId) {
      const organization = await Organization.findById(user.organizationId);
      if (!organization?.isActive) {
        res.status(401).json({
          success: false,
          message: "Invalid credentials"
        });
        return;
      }
    }

    try {
      if (user.twoFactorEnabled) {
        const preAuthToken = generatePreAuthToken(user._id.toString());
        setPreAuthCookie(res, preAuthToken);
        res.json({
          success: true,
          requires2FA: true,
          userId: user._id.toString()
        });
        return;
      }

      const session = await issueSession(user, req, res);
      const requires2FASetup = user.role === "superAdmin" && !user.twoFactorEnabled;
      res.json(
        sessionResponseBody(session, requires2FASetup ? { requires2FASetup: true } : {})
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      res.status(500).json({
        success: false,
        message
      });
    }
  })
);

authRouter.post(
  "/refresh",
  refreshLimiter,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const rawRefresh = extractRefreshTokenRaw(authReq);
    const mobileClient = isMobileApiClient(authReq);

    if (!rawRefresh) {
      if (!mobileClient) {
        clearAuthCookies(res);
      }
      res.status(401).json({
        success: false,
        error: "Invalid refresh token",
        code: "REFRESH_INVALID"
      });
      return;
    }

    const hashed = hashToken(rawRefresh);
    const existing = await RefreshToken.findOne({ token: hashed });

    if (!existing || existing.expiresAt.getTime() <= Date.now()) {
      if (!mobileClient) {
        clearAuthCookies(res);
      }
      res.status(401).json({
        success: false,
        error: "Invalid refresh token",
        code: "REFRESH_INVALID"
      });
      return;
    }

    if (existing.isRevoked) {
      if (existing.replacedByToken) {
        await RefreshToken.revokeFamily(existing.family);
        logSuspiciousEvent("token_reuse_detected", {
          userId: existing.userId.toString(),
          ipAddress: getClientIp(authReq),
          family: existing.family
        });
        if (!mobileClient) {
          clearAuthCookies(res);
        }
        res.status(401).json({
          success: false,
          error: "Token reuse detected",
          code: "TOKEN_REUSE"
        });
        return;
      }

      if (!mobileClient) {
        clearAuthCookies(res);
      }
      res.status(401).json({
        success: false,
        error: "Invalid refresh token",
        code: "REFRESH_INVALID"
      });
      return;
    }

    const user = await User.findById(existing.userId);
    if (!user || !user.isActive) {
      if (!mobileClient) {
        clearAuthCookies(res);
      }
      res.status(401).json({
        success: false,
        error: "Invalid refresh token",
        code: "REFRESH_INVALID"
      });
      return;
    }

    if (user.organizationId) {
      const organization = await Organization.findById(user.organizationId);
      if (!organization?.isActive) {
        if (!mobileClient) {
          clearAuthCookies(res);
        }
        res.status(401).json({
          success: false,
          error: "Invalid refresh token",
          code: "REFRESH_INVALID"
        });
        return;
      }
    }

    try {
      assertRefreshSecretConfigured();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      res.status(500).json({ success: false, message });
      return;
    }

    const rotated = generateRefreshToken(existing.family);
    const accessToken = generateAccessToken(user);

    const revoked = await RefreshToken.findOneAndUpdate(
      { _id: existing._id, isRevoked: false },
      { $set: { isRevoked: true, replacedByToken: rotated.hashed } },
      { new: true }
    );

    if (!revoked) {
      const raceToken = await RefreshToken.findOne({ token: hashed });
      if (raceToken?.isRevoked && raceToken.replacedByToken) {
        await RefreshToken.revokeFamily(raceToken.family);
        logSuspiciousEvent("token_reuse_detected", {
          userId: raceToken.userId.toString(),
          ipAddress: getClientIp(authReq),
          family: raceToken.family
        });
        if (!mobileClient) {
          clearAuthCookies(res);
        }
        res.status(401).json({
          success: false,
          error: "Token reuse detected",
          code: "TOKEN_REUSE"
        });
        return;
      }

      if (!mobileClient) {
        clearAuthCookies(res);
      }
      res.status(401).json({
        success: false,
        error: "Invalid refresh token",
        code: "REFRESH_INVALID"
      });
      return;
    }

    await RefreshToken.create({
      token: rotated.hashed,
      userId: user._id,
      organizationId: user.organizationId,
      family: rotated.family,
      expiresAt: getRefreshTokenExpiry(),
      isRevoked: false,
      replacedByToken: null,
      ipAddress: getClientIp(authReq),
      userAgent: req.headers["user-agent"] ?? ""
    });

    const publicUser = toPublicUser(user);

    if (mobileClient) {
      res.json({
        success: true,
        user: publicUser,
        accessToken,
        refreshToken: rotated.raw,
        tokenType: "Bearer",
        expiresIn: Number(process.env.ACCESS_TOKEN_MAX_AGE_SECONDS ?? 8 * 60 * 60)
      });
      return;
    }

    setAuthCookies(res, accessToken, rotated.raw);
    res.json({
      success: true,
      user: publicUser
    });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const rawRefresh = extractRefreshTokenRaw(authReq);

    if (rawRefresh) {
      const hashed = hashToken(rawRefresh);
      await RefreshToken.findOneAndUpdate(
        { token: hashed, isRevoked: false },
        { $set: { isRevoked: true } }
      );
    }

    if (!isMobileApiClient(authReq)) {
      clearAuthCookies(res);
    }
    res.status(200).json({ success: true });
  })
);

authRouter.post(
  "/logout-all",
  auth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;

    if (!authReq.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    await RefreshToken.updateMany(
      { userId: authReq.user.userId, isRevoked: false },
      { $set: { isRevoked: true } }
    );

    if (!isMobileApiClient(authReq)) {
      clearAuthCookies(res);
    }
    res.status(200).json({ success: true });
  })
);

const meHandler = asyncHandler(async (req, res) => {
  const authReq = req as AuthenticatedRequest;

  if (!authReq.user) {
    res.status(401).json({
      success: false,
      data: null,
      message: "Unauthorized"
    });
    return;
  }

  res.json({
    success: true,
    data: authReq.user,
    user: {
      id: authReq.user.userId,
      name: authReq.user.name,
      phone: authReq.user.phone,
      role: authReq.user.role,
      organizationId: authReq.user.organizationId,
      permissions: authReq.user.staffPermissions,
      parentStudentIds: authReq.user.parentStudentIds
    }
  });
});

authRouter.get("/me", auth, meHandler);
authRouter.post("/me", auth, meHandler);

authRouter.post(
  "/verify-2fa",
  asyncHandler(async (req, res) => {
    const preAuthRaw = req.cookies?.pre_auth_token as string | undefined;

    if (!preAuthRaw) {
      clearPreAuthCookie(res);
      res.status(401).json({
        success: false,
        error: "2FA session expired, please login again",
        code: "2FA_SESSION_EXPIRED"
      });
      return;
    }

    let userId: string;
    try {
      const payload = verifyPreAuthToken(preAuthRaw);
      userId = payload.userId;
    } catch (error) {
      clearPreAuthCookie(res);
      const isExpired = error instanceof jwt.TokenExpiredError;
      res.status(401).json({
        success: false,
        error: "2FA session expired, please login again",
        code: isExpired ? "2FA_SESSION_EXPIRED" : "2FA_SESSION_EXPIRED"
      });
      return;
    }

    const { code } = req.body as { code?: string };
    if (!code || typeof code !== "string") {
      res.status(400).json({
        success: false,
        error: "Verification code is required"
      });
      return;
    }

    if (await is2FAAttemptsExceeded(userId)) {
      clearPreAuthCookie(res);
      res.status(429).json({
        success: false,
        error: "Too many 2FA attempts. Please login again.",
        code: "2FA_RATE_LIMITED"
      });
      return;
    }

    const user = await User.findById(userId).select(
      "+twoFactorSecret +backupCodes twoFactorEnabled email name role organizationId staffPermissions parentStudentIds isActive"
    );

    if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
      clearPreAuthCookie(res);
      res.status(401).json({
        success: false,
        error: "2FA session expired, please login again",
        code: "2FA_SESSION_EXPIRED"
      });
      return;
    }

    let verified = false;

    if (isBackupCodeFormat(code)) {
      const backupResult = await verifyBackupCode(code, user.backupCodes ?? []);
      if (backupResult.valid) {
        user.backupCodes = backupResult.remainingCodes;
        verified = true;
      }
    } else if (/^\d{6}$/.test(code.trim())) {
      const secret = decryptSecretFromStorage(user.twoFactorSecret);
      verified = verifyToken(secret, code.trim());
    }

    if (!verified) {
      res.status(401).json({
        success: false,
        error: "Invalid 2FA code",
        code: "2FA_INVALID"
      });
      return;
    }

    await clear2FAAttempts(userId);
    clearPreAuthCookie(res);

    try {
      const session = await issueSession(user, req, res, true);
      res.json(sessionResponseBody(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      res.status(500).json({ success: false, message });
    }
  })
);

const activeOrgFilter = {
  isActive: true,
  $or: [{ deletedAt: null }, { deletedAt: { $exists: false } }]
};

interface ParentSchoolOption {
  orgCode: string;
  orgName: string;
  organizationId: string;
  parentUserId: string;
  children: Array<{ id: string; name: string; grade: string }>;
}

const buildParentSchoolOptions = async (
  parentUsers: Array<{
    _id: Types.ObjectId;
    organizationId: Types.ObjectId | null;
    parentStudentIds?: Types.ObjectId[];
  }>
): Promise<ParentSchoolOption[]> => {
  const orgIds = parentUsers
    .map((u) => u.organizationId)
    .filter((id): id is Types.ObjectId => !!id);

  const orgs = await Organization.find({
    _id: { $in: orgIds },
    ...activeOrgFilter
  }).select("_id name code");

  const orgById = new Map(orgs.map((o) => [o._id.toString(), o]));
  const allChildIds = parentUsers.flatMap((u) => u.parentStudentIds ?? []);
  const children = allChildIds.length
    ? await Student.find({ _id: { $in: allChildIds }, status: "active" }).select(
        "name grade organizationId"
      )
    : [];

  const options: ParentSchoolOption[] = [];
  for (const parent of parentUsers) {
    if (!parent.organizationId) {
      continue;
    }
    const org = orgById.get(parent.organizationId.toString());
    if (!org) {
      continue;
    }
    const childIds = new Set((parent.parentStudentIds ?? []).map((id) => id.toString()));
    options.push({
      orgCode: org.code,
      orgName: org.name,
      organizationId: org._id.toString(),
      parentUserId: parent._id.toString(),
      children: children
        .filter(
          (c) =>
            childIds.has(c._id.toString()) &&
            c.organizationId.toString() === org._id.toString()
        )
        .map((c) => ({
          id: c._id.toString(),
          name: c.name,
          grade: c.grade
        }))
    });
  }
  return options;
};

/**
 * Parent phone OTP — step 1: request SMS by phone.
 * Optional orgCode narrows to one school; otherwise all matching parent accounts are candidates.
 */
authRouter.post(
  "/otp/request",
  otpRequestLimiter,
  otpRequestValidation,
  validate,
  asyncHandler(async (req, res) => {
    const { phone: rawPhone, orgCode } = req.body as { phone: string; orgCode?: string };
    const phone = normalizeIndianMobile(rawPhone);
    if (!phone) {
      res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit Indian mobile number",
        code: "PHONE_INVALID"
      });
      return;
    }

    const genericSuccess = {
      success: true,
      message: "If this number is registered, an OTP has been sent",
      expiresInSeconds: OTP_CONFIG.ttlSeconds,
      resendCooldownSeconds: OTP_CONFIG.resendCooldownSeconds
    };

    const gate = await canRequestOtp(phone);
    if (!gate.allowed) {
      res.status(429).json({
        success: false,
        message: gate.reason ?? "Too many OTP requests",
        code: "OTP_RATE_LIMITED",
        retryAfterSeconds: gate.retryAfterSeconds
      });
      return;
    }

    const parentQuery: Record<string, unknown> = {
      phone,
      role: "parent",
      isActive: true,
      organizationId: { $ne: null }
    };

    if (orgCode) {
      const organization = await Organization.findOne({
        code: orgCode.trim().toLowerCase(),
        ...activeOrgFilter
      }).select("_id");
      if (!organization) {
        res.json(genericSuccess);
        return;
      }
      parentQuery.organizationId = organization._id;
    }

    const parents = await User.find(parentQuery).select("_id organizationId");
    if (parents.length === 0) {
      res.json(genericSuccess);
      return;
    }

    // Keep only parents whose org is still active
    const activeOrgIds = new Set(
      (
        await Organization.find({
          _id: { $in: parents.map((p) => p.organizationId).filter(Boolean) },
          ...activeOrgFilter
        }).select("_id")
      ).map((o) => o._id.toString())
    );
    const eligible = parents.filter(
      (p) => p.organizationId && activeOrgIds.has(p.organizationId.toString())
    );
    if (eligible.length === 0) {
      res.json(genericSuccess);
      return;
    }

    try {
      const otp = generateOtpCode();
      await storeParentOtp(
        phone,
        otp,
        eligible.map((p) => p._id.toString())
      );

      const smsResult = await sendParentLoginOtp(phone, otp);
      if (!smsResult.success) {
        await clearParentOtp(phone);
        res.status(503).json({
          success: false,
          message: "Unable to send OTP right now. Please try again.",
          code: "SMS_FAILED"
        });
        return;
      }

      // OTP_DEBUG=true returns the code in the API (shown on parent login UI) for staging/local testing.
      // Keep false in real production once SMS is live.
      res.json({
        ...genericSuccess,
        ...(process.env.OTP_DEBUG === "true" ? { debugOtp: otp } : {})
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to send OTP";
      res.status(503).json({
        success: false,
        message,
        code: "OTP_UNAVAILABLE"
      });
    }
  })
);

/**
 * Parent phone OTP — step 2: verify code.
 * 1 school → issue session.
 * 2+ schools → requiresSchoolSelection + selectionToken + schools (popup on app).
 */
authRouter.post(
  "/otp/verify",
  otpVerifyLimiter,
  otpVerifyValidation,
  validate,
  asyncHandler(async (req, res) => {
    const { phone: rawPhone, otp, orgCode } = req.body as {
      phone: string;
      otp: string;
      orgCode?: string;
    };
    const phone = normalizeIndianMobile(rawPhone);

    if (!phone) {
      res.status(400).json({
        success: false,
        message: "Enter a valid 10-digit Indian mobile number",
        code: "PHONE_INVALID"
      });
      return;
    }

    const verified = await verifyStoredParentOtp(phone, otp.trim());
    if (!verified.ok) {
      res.status(401).json({
        success: false,
        message: verified.message,
        code: verified.code
      });
      return;
    }

    let parentUsers = await User.find({
      _id: { $in: verified.payload.parentUserIds },
      phone,
      role: "parent",
      isActive: true
    }).select("_id organizationId parentStudentIds name phone");

    if (orgCode) {
      const organization = await Organization.findOne({
        code: orgCode.trim().toLowerCase(),
        ...activeOrgFilter
      }).select("_id");
      if (!organization) {
        res.status(401).json({
          success: false,
          message: "Invalid OTP",
          code: "OTP_INVALID"
        });
        return;
      }
      parentUsers = parentUsers.filter(
        (u) => u.organizationId?.toString() === organization._id.toString()
      );
    }

    const schools = await buildParentSchoolOptions(parentUsers);
    if (schools.length === 0) {
      await clearParentOtp(phone);
      res.status(401).json({
        success: false,
        message: "Invalid OTP",
        code: "OTP_INVALID"
      });
      return;
    }

    await clearParentOtp(phone);

    if (schools.length === 1) {
      const user = await User.findById(schools[0].parentUserId);
      if (!user) {
        res.status(401).json({
          success: false,
          message: "Invalid OTP",
          code: "OTP_INVALID"
        });
        return;
      }
      try {
        const session = await issueSession(user, req as AuthenticatedRequest, res);
        res.json(sessionResponseBody(session));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Authentication failed";
        res.status(500).json({ success: false, message });
      }
      return;
    }

    try {
      const selectionToken = await createSchoolSelectionToken(
        phone,
        schools.map((s) => s.parentUserId)
      );
      res.json({
        success: true,
        requiresSchoolSelection: true,
        selectionToken,
        schools,
        expiresInSeconds: OTP_CONFIG.schoolSelectTtlSeconds,
        message: "Multiple schools found. Select a school to continue."
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      res.status(503).json({ success: false, message, code: "OTP_UNAVAILABLE" });
    }
  })
);

/**
 * Parent phone OTP — step 3: after multi-school popup, select org and issue session.
 */
authRouter.post(
  "/otp/select-school",
  otpVerifyLimiter,
  otpSelectSchoolValidation,
  validate,
  asyncHandler(async (req, res) => {
    const { selectionToken, orgCode } = req.body as {
      selectionToken: string;
      orgCode: string;
    };

    const selection = await consumeSchoolSelectionToken(selectionToken);
    if (!selection) {
      res.status(401).json({
        success: false,
        message: "School selection expired. Please verify OTP again.",
        code: "SELECTION_EXPIRED"
      });
      return;
    }

    const organization = await Organization.findOne({
      code: orgCode.trim().toLowerCase(),
      ...activeOrgFilter
    }).select("_id");

    if (!organization) {
      res.status(400).json({
        success: false,
        message: "Invalid school selection",
        code: "ORG_INVALID"
      });
      return;
    }

    const user = await User.findOne({
      _id: { $in: selection.parentUserIds },
      phone: selection.phone,
      role: "parent",
      organizationId: organization._id,
      isActive: true
    });

    if (!user) {
      res.status(400).json({
        success: false,
        message: "Invalid school selection",
        code: "ORG_INVALID"
      });
      return;
    }

    try {
      const session = await issueSession(user, req as AuthenticatedRequest, res);
      res.json(sessionResponseBody(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Authentication failed";
      res.status(500).json({ success: false, message });
    }
  })
);

authRouter.post(
  "/2fa/setup",
  auth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const user = await User.findById(authReq.user.userId);
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    if (user.twoFactorEnabled) {
      res.status(400).json({ success: false, error: "2FA is already enabled" });
      return;
    }

    const orgName = await getOrganizationName(user);
    const { secret, otpauthUrl } = generateSecret(user.email, orgName);
    const qrCode = await generateQRCode(otpauthUrl);

    await setPendingTotpSecret(user._id.toString(), secret);

    res.json({
      success: true,
      qrCode,
      manualEntryKey: secret
    });
  })
);

authRouter.post(
  "/2fa/confirm",
  auth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { code } = req.body as { code?: string };
    if (!code || typeof code !== "string") {
      res.status(400).json({ success: false, error: "Verification code is required" });
      return;
    }

    const pendingSecret = await getPendingTotpSecret(authReq.user.userId);
    if (!pendingSecret) {
      res.status(400).json({ success: false, error: "Setup session expired, restart setup" });
      return;
    }

    if (!verifyToken(pendingSecret, code.trim())) {
      res.status(400).json({ success: false, error: "Invalid code, please try again" });
      return;
    }

    const user = await User.findById(authReq.user.userId).select("+backupCodes");
    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const backup = await generateBackupCodes();

    user.twoFactorSecret = encryptSecretForStorage(pendingSecret);
    user.twoFactorEnabled = true;
    user.twoFactorVerifiedAt = new Date();
    user.backupCodes = backup.hashed;
    await user.save();

    await deletePendingTotpSecret(authReq.user.userId);

    res.json({
      success: true,
      backupCodes: backup.raw
    });
  })
);

authRouter.post(
  "/2fa/disable",
  auth,
  blockSuperAdmin2FADisable,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const { code, password } = req.body as { code?: string; password?: string };
    if (!code || !password) {
      res.status(400).json({ success: false, error: "Code and password are required" });
      return;
    }

    const user = await User.findById(authReq.user.userId).select(
      "+twoFactorSecret +backupCodes passwordHash twoFactorEnabled"
    );

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(400).json({ success: false, error: "2FA is not enabled" });
      return;
    }

    const passwordMatched = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatched) {
      res.status(401).json({ success: false, error: "Invalid password" });
      return;
    }

    const secret = decryptSecretFromStorage(user.twoFactorSecret);
    if (!verifyToken(secret, code.trim())) {
      res.status(401).json({ success: false, error: "Invalid 2FA code" });
      return;
    }

    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorVerifiedAt = undefined;
    user.backupCodes = [];
    await user.save();

    res.json({ success: true });
  })
);

const isSuperAdminVerificationExpired = (verifiedAt?: Date | null): boolean => {
  if (!verifiedAt) {
    return true;
  }
  return Date.now() - verifiedAt.getTime() > TWO_FACTOR_VERIFICATION_MAX_AGE_MS;
};

authRouter.post(
  "/2fa/reverify",
  auth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    if (authReq.user.role !== "superAdmin") {
      res.status(403).json({
        success: false,
        error: "2FA re-verification is only required for super admin accounts",
        code: "2FA_REVERIFY_NOT_REQUIRED"
      });
      return;
    }

    const { code } = req.body as { code?: string };
    if (!code || typeof code !== "string") {
      res.status(400).json({ success: false, error: "Verification code is required" });
      return;
    }

    if (await is2FAAttemptsExceeded(authReq.user.userId)) {
      res.status(429).json({
        success: false,
        error: "Too many 2FA attempts. Please try again later.",
        code: "2FA_RATE_LIMITED"
      });
      return;
    }

    const user = await User.findById(authReq.user.userId).select(
      "+twoFactorSecret +backupCodes twoFactorEnabled"
    );

    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
      res.status(403).json({
        success: false,
        error: "Two-factor authentication setup is required for super admin accounts",
        code: "2FA_SETUP_REQUIRED"
      });
      return;
    }

    let verified = false;

    if (isBackupCodeFormat(code)) {
      const backupResult = await verifyBackupCode(code, user.backupCodes ?? []);
      if (backupResult.valid) {
        user.backupCodes = backupResult.remainingCodes;
        verified = true;
      }
    } else if (/^\d{6}$/.test(code.trim())) {
      const secret = decryptSecretFromStorage(user.twoFactorSecret);
      verified = verifyToken(secret, code.trim());
    }

    if (!verified) {
      res.status(401).json({
        success: false,
        error: "Invalid 2FA code",
        code: "2FA_INVALID"
      });
      return;
    }

    await clear2FAAttempts(authReq.user.userId);
    user.twoFactorVerifiedAt = new Date();
    await user.save();

    res.json({
      success: true,
      verifiedAt: user.twoFactorVerifiedAt
    });
  })
);

authRouter.get(
  "/2fa/status",
  auth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    if (!authReq.user) {
      res.status(401).json({ success: false, message: "Unauthorized" });
      return;
    }

    const user = await User.findById(authReq.user.userId).select("+backupCodes twoFactorEnabled twoFactorVerifiedAt");

    if (!user) {
      res.status(404).json({ success: false, message: "User not found" });
      return;
    }

    const isSuperAdmin = authReq.user.role === "superAdmin";
    const needsSetup = isSuperAdmin && !user.twoFactorEnabled;
    const needsReverify =
      isSuperAdmin && user.twoFactorEnabled && isSuperAdminVerificationExpired(user.twoFactorVerifiedAt);

    res.json({
      success: true,
      enabled: user.twoFactorEnabled,
      verifiedAt: user.twoFactorVerifiedAt ?? null,
      backupCodesRemaining: user.twoFactorEnabled ? (user.backupCodes?.length ?? 0) : 0,
      needsSetup,
      needsReverify
    });
  })
);

export default authRouter;
