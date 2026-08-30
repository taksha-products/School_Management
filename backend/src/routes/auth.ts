import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import rateLimit from "express-rate-limit";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { blockSuperAdmin2FADisable } from "../middleware/require2FA";
import { validate } from "../middleware/validate";
import { Organization } from "../models/Organization";
import { getOrgBrandingLabel } from "../services/orgThemeService";
import { getRefreshTokenExpiry, RefreshToken } from "../models/RefreshToken";
import { User, type IUser } from "../models/User";
import { asyncHandler } from "../utils/asyncHandler";
import { clearAuthCookies, clearPreAuthCookie, setAuthCookies, setPreAuthCookie } from "../utils/authCookies";
import {
  assertRefreshSecretConfigured,
  generateAccessToken,
  generatePreAuthToken,
  generateRefreshToken,
  verifyPreAuthToken
} from "../utils/jwt";
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
import { loginValidation } from "../validators/auth";

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

interface PublicUser {
  id: string;
  name: string;
  email: string;
  role: IUser["role"];
  organizationId: string | null;
  permissions?: IUser["staffPermissions"];
  parentStudentIds?: string[];
}

const toPublicUser = (user: IUser): PublicUser => ({
  id: user._id.toString(),
  name: user.name,
  email: user.email,
  role: user.role,
  organizationId: user.organizationId ? user.organizationId.toString() : null,
  permissions: user.staffPermissions,
  parentStudentIds: user.parentStudentIds?.map((id) => id.toString())
});

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

const issueSession = async (
  user: IUser,
  req: AuthenticatedRequest,
  res: Parameters<typeof setAuthCookies>[0],
  updateTwoFactorVerified = false
): Promise<PublicUser> => {
  assertRefreshSecretConfigured();

  if (updateTwoFactorVerified) {
    user.twoFactorVerifiedAt = new Date();
    await user.save();
  }

  const accessToken = generateAccessToken(user);
  const refresh = generateRefreshToken();
  await persistRefreshToken(user, refresh.hashed, refresh.family, req);
  setAuthCookies(res, accessToken, refresh.raw);

  return toPublicUser(user);
};

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

      const publicUser = await issueSession(user, req, res);
      res.json({ success: true, user: publicUser });
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
    const rawRefresh = req.cookies?.refresh_token as string | undefined;

    if (!rawRefresh) {
      clearAuthCookies(res);
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
      clearAuthCookies(res);
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
          ipAddress: getClientIp(req),
          family: existing.family
        });
        clearAuthCookies(res);
        res.status(401).json({
          success: false,
          error: "Token reuse detected",
          code: "TOKEN_REUSE"
        });
        return;
      }

      clearAuthCookies(res);
      res.status(401).json({
        success: false,
        error: "Invalid refresh token",
        code: "REFRESH_INVALID"
      });
      return;
    }

    const user = await User.findById(existing.userId);
    if (!user || !user.isActive) {
      clearAuthCookies(res);
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
        clearAuthCookies(res);
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
          ipAddress: getClientIp(req),
          family: raceToken.family
        });
        clearAuthCookies(res);
        res.status(401).json({
          success: false,
          error: "Token reuse detected",
          code: "TOKEN_REUSE"
        });
        return;
      }

      clearAuthCookies(res);
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
      ipAddress: getClientIp(req),
      userAgent: req.headers["user-agent"] ?? ""
    });

    setAuthCookies(res, accessToken, rotated.raw);

    res.json({
      success: true,
      user: {
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        role: user.role,
        organizationId: user.organizationId ? user.organizationId.toString() : null
      }
    });
  })
);

authRouter.post(
  "/logout",
  asyncHandler(async (req, res) => {
    const rawRefresh = req.cookies?.refresh_token as string | undefined;

    if (rawRefresh) {
      const hashed = hashToken(rawRefresh);
      await RefreshToken.findOneAndUpdate(
        { token: hashed, isRevoked: false },
        { $set: { isRevoked: true } }
      );
    }

    clearAuthCookies(res);
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

    clearAuthCookies(res);
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
      const publicUser = await issueSession(user, req, res, true);
      res.json({ success: true, user: publicUser });
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

    res.json({
      success: true,
      enabled: user.twoFactorEnabled,
      verifiedAt: user.twoFactorVerifiedAt ?? null,
      backupCodesRemaining: user.twoFactorEnabled ? (user.backupCodes?.length ?? 0) : 0
    });
  })
);

export default authRouter;
