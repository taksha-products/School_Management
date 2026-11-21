import type { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

import type { StaffPermissions, UserRole } from "../models/User";
import { verifyAccessToken } from "../utils/jwt";

export interface DecodedAuthUser {
  userId: string;
  role: UserRole;
  organizationId: string | null;
  name: string;
  phone?: string;
  staffPermissions?: StaffPermissions;
  parentStudentIds?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: DecodedAuthUser;
}

const extractBearerToken = (authorization: string | undefined): string | null => {
  if (!authorization?.startsWith("Bearer ")) {
    return null;
  }
  return authorization.slice("Bearer ".length);
};

const extractAccessToken = (req: Request): string | null => {
  const cookieToken = req.cookies?.access_token as string | undefined;
  if (cookieToken) {
    return cookieToken;
  }

  const isMobileClient = req.headers["x-api-client"] === "mobile";
  if (isMobileClient) {
    return extractBearerToken(req.headers.authorization);
  }

  return null;
};

/**
 * Authenticates requests via:
 * - Web: httpOnly `access_token` cookie
 * - Mobile: `Authorization: Bearer <accessToken>` **and** `x-api-client: mobile`
 */
export const auth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const token = extractAccessToken(req);

  if (!token) {
    res.status(401).json({
      success: false,
      data: null,
      message: "Unauthorized: token missing",
      code: "TOKEN_INVALID"
    });
    return;
  }

  try {
    const decoded = verifyAccessToken(token);
    req.user = {
      userId: decoded.userId,
      role: decoded.role as UserRole,
      organizationId: decoded.organizationId,
      name: decoded.name,
      phone: decoded.phone,
      staffPermissions: decoded.staffPermissions ?? decoded.permissions,
      parentStudentIds: decoded.parentStudentIds
    };
    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      res.status(401).json({
        success: false,
        data: null,
        message: "Access token expired",
        code: "TOKEN_EXPIRED"
      });
      return;
    }

    res.status(401).json({
      success: false,
      data: null,
      message: "Unauthorized: invalid token",
      code: "TOKEN_INVALID"
    });
  }
};
