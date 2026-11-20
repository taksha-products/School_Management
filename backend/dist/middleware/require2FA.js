"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.blockSuperAdmin2FADisable = exports.require2FA = void 0;
const twoFactor_1 = require("../constants/twoFactor");
const User_1 = require("../models/User");
/**
 * Ensures super-admin users have 2FA enabled and verified within the last 24 hours.
 * Must run after {@link auth} middleware.
 */
const require2FA = async (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            error: "Unauthorized",
            code: "TOKEN_INVALID"
        });
        return;
    }
    if (req.user.role !== "superAdmin") {
        next();
        return;
    }
    const user = await User_1.User.findById(req.user.userId).select("+twoFactorSecret twoFactorEnabled twoFactorVerifiedAt");
    if (!user) {
        res.status(401).json({
            success: false,
            error: "Unauthorized",
            code: "TOKEN_INVALID"
        });
        return;
    }
    if (!user.twoFactorEnabled) {
        res.status(403).json({
            success: false,
            error: "Two-factor authentication setup is required for super admin accounts",
            code: "2FA_SETUP_REQUIRED"
        });
        return;
    }
    if (!user.twoFactorVerifiedAt) {
        res.status(403).json({
            success: false,
            error: "2FA verification required",
            code: "2FA_REQUIRED"
        });
        return;
    }
    const verifiedAt = user.twoFactorVerifiedAt.getTime();
    const isRecent = Date.now() - verifiedAt <= twoFactor_1.TWO_FACTOR_VERIFICATION_MAX_AGE_MS;
    if (!isRecent) {
        res.status(403).json({
            success: false,
            error: "2FA verification required",
            code: "2FA_REQUIRED"
        });
        return;
    }
    next();
};
exports.require2FA = require2FA;
/**
 * Blocks super admins from disabling 2FA (mandatory for the role).
 */
const blockSuperAdmin2FADisable = (req, res, next) => {
    if (req.user?.role === "superAdmin") {
        res.status(403).json({
            success: false,
            error: "Super admin accounts cannot disable two-factor authentication",
            code: "2FA_DISABLED_FOR_SUPERADMIN"
        });
        return;
    }
    next();
};
exports.blockSuperAdmin2FADisable = blockSuperAdmin2FADisable;
