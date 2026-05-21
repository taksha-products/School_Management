import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "./auth";

/**
 * Resolves organization scope from JWT only.
 * superAdmin may pass ?orgId=; never trust organizationId from body or query otherwise.
 */
export const orgScope = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      data: null,
      message: "Unauthorized"
    });
    return;
  }

  const orgId =
    req.user.role === "superAdmin"
      ? (req.query.orgId as string) || null
      : req.user.organizationId ?? null;

  if (req.user.role !== "superAdmin" && !orgId) {
    res.status(403).json({
      success: false,
      data: null,
      message: "Forbidden: user is not linked to an organization"
    });
    return;
  }

  if (req.body && typeof req.body === "object" && "organizationId" in req.body) {
    delete (req.body as Record<string, unknown>).organizationId;
  }

  res.locals.organizationId = orgId;
  next();
};
