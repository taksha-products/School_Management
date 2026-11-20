import type { NextFunction, Response } from "express";

import { TWO_FACTOR_VERIFICATION_MAX_AGE_MS } from "../constants/twoFactor";
import type { AuthenticatedRequest } from "./auth";
import { User } from "../models/User";

/**
 * Ensures super-admin users have 2FA enabled and verified within the last 24 hours.
 * Must run after {@link auth} middleware.
 */
export const require2FA = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
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

  const user = await User.findById(req.user.userId).select(
    "+twoFactorSecret twoFactorEnabled twoFactorVerifiedAt"
  );

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
  const isRecent = Date.now() - verifiedAt <= TWO_FACTOR_VERIFICATION_MAX_AGE_MS;

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

/**
 * Blocks super admins from disabling 2FA (mandatory for the role).
 */
export const blockSuperAdmin2FADisable = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
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
