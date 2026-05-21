import type { NextFunction, Request, Response } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

import type { StaffPermissions, UserRole } from "../models/User";

export interface DecodedAuthUser {
  userId: string;
  role: UserRole;
  organizationId: string | null;
  name: string;
  staffPermissions?: StaffPermissions;
  parentStudentIds?: string[];
}

export interface AuthenticatedRequest extends Request {
  user?: DecodedAuthUser;
}

export const auth = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  const authorization = req.headers.authorization;
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length)
    : null;

  if (!token) {
    res.status(401).json({
      success: false,
      data: null,
      message: "Unauthorized: token missing"
    });
    return;
  }

  try {
    const secret = process.env.JWT_SECRET;
    if (!secret) {
      res.status(500).json({
        success: false,
        data: null,
        message: "JWT secret is not configured"
      });
      return;
    }

    const decoded = jwt.verify(token, secret) as JwtPayload & DecodedAuthUser;
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
      organizationId: decoded.organizationId ?? null,
      name: decoded.name,
      staffPermissions: decoded.staffPermissions,
      parentStudentIds: decoded.parentStudentIds
    };
    next();
  } catch {
    res.status(401).json({
      success: false,
      data: null,
      message: "Unauthorized: invalid token"
    });
  }
};
