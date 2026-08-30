"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const auth_1 = require("../middleware/auth");
const require2FA_1 = require("../middleware/require2FA");
const validate_1 = require("../middleware/validate");
const Organization_1 = require("../models/Organization");
const orgThemeService_1 = require("../services/orgThemeService");
const RefreshToken_1 = require("../models/RefreshToken");
const User_1 = require("../models/User");
const asyncHandler_1 = require("../utils/asyncHandler");
const authCookies_1 = require("../utils/authCookies");
const jwt_1 = require("../utils/jwt");
const tokenHash_1 = require("../utils/tokenHash");
const totp_1 = require("../utils/totp");
const twoFactorRedis_1 = require("../utils/twoFactorRedis");
const auth_2 = require("../validators/auth");
const authRouter = (0, express_1.Router)();
const loginLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many login attempts." }
});
const refreshLimiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { success: false, message: "Too many refresh attempts." }
});
const toPublicUser = (user) => ({
    id: user._id.toString(),
    name: user.name,
    email: user.email,
    role: user.role,
    organizationId: user.organizationId ? user.organizationId.toString() : null,
    permissions: user.staffPermissions,
    parentStudentIds: user.parentStudentIds?.map((id) => id.toString())
});
const getClientIp = (req) => {
    const forwarded = req.headers["x-forwarded-for"];
    if (typeof forwarded === "string" && forwarded.length > 0) {
        return forwarded.split(",")[0]?.trim() ?? "";
    }
    return req.socket.remoteAddress ?? "";
};
const persistRefreshToken = async (user, hashed, family, req) => {
    await RefreshToken_1.RefreshToken.create({
        token: hashed,
        userId: user._id,
        organizationId: user.organizationId,
        family,
        expiresAt: (0, RefreshToken_1.getRefreshTokenExpiry)(),
        isRevoked: false,
        replacedByToken: null,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] ?? ""
    });
};
const issueSession = async (user, req, res, updateTwoFactorVerified = false) => {
    (0, jwt_1.assertRefreshSecretConfigured)();
    if (updateTwoFactorVerified) {
        user.twoFactorVerifiedAt = new Date();
        await user.save();
    }
    const accessToken = (0, jwt_1.generateAccessToken)(user);
    const refresh = (0, jwt_1.generateRefreshToken)();
    await persistRefreshToken(user, refresh.hashed, refresh.family, req);
    (0, authCookies_1.setAuthCookies)(res, accessToken, refresh.raw);
    return toPublicUser(user);
};
const getOrganizationName = async (user) => {
    if (!user.organizationId) {
        return "TAKSHA";
    }
    return (0, orgThemeService_1.getOrgBrandingLabel)(user.organizationId.toString());
};
const logSuspiciousEvent = (event, details) => {
    console.warn({
        type: "auth_security",
        event,
        timestamp: new Date().toISOString(),
        ...details
    });
};
authRouter.post("/login", loginLimiter, auth_2.loginValidation, validate_1.validate, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const { email, password } = req.body;
    const user = await User_1.User.findOne({ email });
    if (!user || !user.isActive) {
        res.status(401).json({
            success: false,
            message: "Invalid credentials"
        });
        return;
    }
    const passwordMatched = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!passwordMatched) {
        res.status(401).json({
            success: false,
            message: "Invalid credentials"
        });
        return;
    }
    if (user.organizationId) {
        const organization = await Organization_1.Organization.findById(user.organizationId);
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
            const preAuthToken = (0, jwt_1.generatePreAuthToken)(user._id.toString());
            (0, authCookies_1.setPreAuthCookie)(res, preAuthToken);
            res.json({
                success: true,
                requires2FA: true,
                userId: user._id.toString()
            });
            return;
        }
        const publicUser = await issueSession(user, req, res);
        res.json({ success: true, user: publicUser });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Authentication failed";
        res.status(500).json({
            success: false,
            message
        });
    }
}));
authRouter.post("/refresh", refreshLimiter, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const rawRefresh = req.cookies?.refresh_token;
    if (!rawRefresh) {
        (0, authCookies_1.clearAuthCookies)(res);
        res.status(401).json({
            success: false,
            error: "Invalid refresh token",
            code: "REFRESH_INVALID"
        });
        return;
    }
    const hashed = (0, tokenHash_1.hashToken)(rawRefresh);
    const existing = await RefreshToken_1.RefreshToken.findOne({ token: hashed });
    if (!existing || existing.expiresAt.getTime() <= Date.now()) {
        (0, authCookies_1.clearAuthCookies)(res);
        res.status(401).json({
            success: false,
            error: "Invalid refresh token",
            code: "REFRESH_INVALID"
        });
        return;
    }
    if (existing.isRevoked) {
        if (existing.replacedByToken) {
            await RefreshToken_1.RefreshToken.revokeFamily(existing.family);
            logSuspiciousEvent("token_reuse_detected", {
                userId: existing.userId.toString(),
                ipAddress: getClientIp(req),
                family: existing.family
            });
            (0, authCookies_1.clearAuthCookies)(res);
            res.status(401).json({
                success: false,
                error: "Token reuse detected",
                code: "TOKEN_REUSE"
            });
            return;
        }
        (0, authCookies_1.clearAuthCookies)(res);
        res.status(401).json({
            success: false,
            error: "Invalid refresh token",
            code: "REFRESH_INVALID"
        });
        return;
    }
    const user = await User_1.User.findById(existing.userId);
    if (!user || !user.isActive) {
        (0, authCookies_1.clearAuthCookies)(res);
        res.status(401).json({
            success: false,
            error: "Invalid refresh token",
            code: "REFRESH_INVALID"
        });
        return;
    }
    if (user.organizationId) {
        const organization = await Organization_1.Organization.findById(user.organizationId);
        if (!organization?.isActive) {
            (0, authCookies_1.clearAuthCookies)(res);
            res.status(401).json({
                success: false,
                error: "Invalid refresh token",
                code: "REFRESH_INVALID"
            });
            return;
        }
    }
    try {
        (0, jwt_1.assertRefreshSecretConfigured)();
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Authentication failed";
        res.status(500).json({ success: false, message });
        return;
    }
    const rotated = (0, jwt_1.generateRefreshToken)(existing.family);
    const accessToken = (0, jwt_1.generateAccessToken)(user);
    const revoked = await RefreshToken_1.RefreshToken.findOneAndUpdate({ _id: existing._id, isRevoked: false }, { $set: { isRevoked: true, replacedByToken: rotated.hashed } }, { new: true });
    if (!revoked) {
        const raceToken = await RefreshToken_1.RefreshToken.findOne({ token: hashed });
        if (raceToken?.isRevoked && raceToken.replacedByToken) {
            await RefreshToken_1.RefreshToken.revokeFamily(raceToken.family);
            logSuspiciousEvent("token_reuse_detected", {
                userId: raceToken.userId.toString(),
                ipAddress: getClientIp(req),
                family: raceToken.family
            });
            (0, authCookies_1.clearAuthCookies)(res);
            res.status(401).json({
                success: false,
                error: "Token reuse detected",
                code: "TOKEN_REUSE"
            });
            return;
        }
        (0, authCookies_1.clearAuthCookies)(res);
        res.status(401).json({
            success: false,
            error: "Invalid refresh token",
            code: "REFRESH_INVALID"
        });
        return;
    }
    await RefreshToken_1.RefreshToken.create({
        token: rotated.hashed,
        userId: user._id,
        organizationId: user.organizationId,
        family: rotated.family,
        expiresAt: (0, RefreshToken_1.getRefreshTokenExpiry)(),
        isRevoked: false,
        replacedByToken: null,
        ipAddress: getClientIp(req),
        userAgent: req.headers["user-agent"] ?? ""
    });
    (0, authCookies_1.setAuthCookies)(res, accessToken, rotated.raw);
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
}));
authRouter.post("/logout", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const rawRefresh = req.cookies?.refresh_token;
    if (rawRefresh) {
        const hashed = (0, tokenHash_1.hashToken)(rawRefresh);
        await RefreshToken_1.RefreshToken.findOneAndUpdate({ token: hashed, isRevoked: false }, { $set: { isRevoked: true } });
    }
    (0, authCookies_1.clearAuthCookies)(res);
    res.status(200).json({ success: true });
}));
authRouter.post("/logout-all", auth_1.auth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    if (!authReq.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
    }
    await RefreshToken_1.RefreshToken.updateMany({ userId: authReq.user.userId, isRevoked: false }, { $set: { isRevoked: true } });
    (0, authCookies_1.clearAuthCookies)(res);
    res.status(200).json({ success: true });
}));
const meHandler = (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
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
authRouter.get("/me", auth_1.auth, meHandler);
authRouter.post("/me", auth_1.auth, meHandler);
authRouter.post("/verify-2fa", (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const preAuthRaw = req.cookies?.pre_auth_token;
    if (!preAuthRaw) {
        (0, authCookies_1.clearPreAuthCookie)(res);
        res.status(401).json({
            success: false,
            error: "2FA session expired, please login again",
            code: "2FA_SESSION_EXPIRED"
        });
        return;
    }
    let userId;
    try {
        const payload = (0, jwt_1.verifyPreAuthToken)(preAuthRaw);
        userId = payload.userId;
    }
    catch (error) {
        (0, authCookies_1.clearPreAuthCookie)(res);
        const isExpired = error instanceof jsonwebtoken_1.default.TokenExpiredError;
        res.status(401).json({
            success: false,
            error: "2FA session expired, please login again",
            code: isExpired ? "2FA_SESSION_EXPIRED" : "2FA_SESSION_EXPIRED"
        });
        return;
    }
    const { code } = req.body;
    if (!code || typeof code !== "string") {
        res.status(400).json({
            success: false,
            error: "Verification code is required"
        });
        return;
    }
    if (await (0, twoFactorRedis_1.is2FAAttemptsExceeded)(userId)) {
        (0, authCookies_1.clearPreAuthCookie)(res);
        res.status(429).json({
            success: false,
            error: "Too many 2FA attempts. Please login again.",
            code: "2FA_RATE_LIMITED"
        });
        return;
    }
    const user = await User_1.User.findById(userId).select("+twoFactorSecret +backupCodes twoFactorEnabled email name role organizationId staffPermissions parentStudentIds isActive");
    if (!user || !user.isActive || !user.twoFactorEnabled || !user.twoFactorSecret) {
        (0, authCookies_1.clearPreAuthCookie)(res);
        res.status(401).json({
            success: false,
            error: "2FA session expired, please login again",
            code: "2FA_SESSION_EXPIRED"
        });
        return;
    }
    let verified = false;
    if ((0, totp_1.isBackupCodeFormat)(code)) {
        const backupResult = await (0, totp_1.verifyBackupCode)(code, user.backupCodes ?? []);
        if (backupResult.valid) {
            user.backupCodes = backupResult.remainingCodes;
            verified = true;
        }
    }
    else if (/^\d{6}$/.test(code.trim())) {
        const secret = (0, totp_1.decryptSecretFromStorage)(user.twoFactorSecret);
        verified = (0, totp_1.verifyToken)(secret, code.trim());
    }
    if (!verified) {
        res.status(401).json({
            success: false,
            error: "Invalid 2FA code",
            code: "2FA_INVALID"
        });
        return;
    }
    await (0, twoFactorRedis_1.clear2FAAttempts)(userId);
    (0, authCookies_1.clearPreAuthCookie)(res);
    try {
        const publicUser = await issueSession(user, req, res, true);
        res.json({ success: true, user: publicUser });
    }
    catch (error) {
        const message = error instanceof Error ? error.message : "Authentication failed";
        res.status(500).json({ success: false, message });
    }
}));
authRouter.post("/2fa/setup", auth_1.auth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    if (!authReq.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
    }
    const user = await User_1.User.findById(authReq.user.userId);
    if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
    }
    if (user.twoFactorEnabled) {
        res.status(400).json({ success: false, error: "2FA is already enabled" });
        return;
    }
    const orgName = await getOrganizationName(user);
    const { secret, otpauthUrl } = (0, totp_1.generateSecret)(user.email, orgName);
    const qrCode = await (0, totp_1.generateQRCode)(otpauthUrl);
    await (0, twoFactorRedis_1.setPendingTotpSecret)(user._id.toString(), secret);
    res.json({
        success: true,
        qrCode,
        manualEntryKey: secret
    });
}));
authRouter.post("/2fa/confirm", auth_1.auth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    if (!authReq.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
    }
    const { code } = req.body;
    if (!code || typeof code !== "string") {
        res.status(400).json({ success: false, error: "Verification code is required" });
        return;
    }
    const pendingSecret = await (0, twoFactorRedis_1.getPendingTotpSecret)(authReq.user.userId);
    if (!pendingSecret) {
        res.status(400).json({ success: false, error: "Setup session expired, restart setup" });
        return;
    }
    if (!(0, totp_1.verifyToken)(pendingSecret, code.trim())) {
        res.status(400).json({ success: false, error: "Invalid code, please try again" });
        return;
    }
    const user = await User_1.User.findById(authReq.user.userId).select("+backupCodes");
    if (!user) {
        res.status(404).json({ success: false, message: "User not found" });
        return;
    }
    const backup = await (0, totp_1.generateBackupCodes)();
    user.twoFactorSecret = (0, totp_1.encryptSecretForStorage)(pendingSecret);
    user.twoFactorEnabled = true;
    user.twoFactorVerifiedAt = new Date();
    user.backupCodes = backup.hashed;
    await user.save();
    await (0, twoFactorRedis_1.deletePendingTotpSecret)(authReq.user.userId);
    res.json({
        success: true,
        backupCodes: backup.raw
    });
}));
authRouter.post("/2fa/disable", auth_1.auth, require2FA_1.blockSuperAdmin2FADisable, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    if (!authReq.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
    }
    const { code, password } = req.body;
    if (!code || !password) {
        res.status(400).json({ success: false, error: "Code and password are required" });
        return;
    }
    const user = await User_1.User.findById(authReq.user.userId).select("+twoFactorSecret +backupCodes passwordHash twoFactorEnabled");
    if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
        res.status(400).json({ success: false, error: "2FA is not enabled" });
        return;
    }
    const passwordMatched = await bcryptjs_1.default.compare(password, user.passwordHash);
    if (!passwordMatched) {
        res.status(401).json({ success: false, error: "Invalid password" });
        return;
    }
    const secret = (0, totp_1.decryptSecretFromStorage)(user.twoFactorSecret);
    if (!(0, totp_1.verifyToken)(secret, code.trim())) {
        res.status(401).json({ success: false, error: "Invalid 2FA code" });
        return;
    }
    user.twoFactorEnabled = false;
    user.twoFactorSecret = undefined;
    user.twoFactorVerifiedAt = undefined;
    user.backupCodes = [];
    await user.save();
    res.json({ success: true });
}));
authRouter.get("/2fa/status", auth_1.auth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    if (!authReq.user) {
        res.status(401).json({ success: false, message: "Unauthorized" });
        return;
    }
    const user = await User_1.User.findById(authReq.user.userId).select("+backupCodes twoFactorEnabled twoFactorVerifiedAt");
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
}));
exports.default = authRouter;
