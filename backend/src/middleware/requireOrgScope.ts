import type { NextFunction, Response } from "express";

import { getScopedOrganizationId } from "../utils/orgFilter";
import type { AuthenticatedRequest } from "./auth";

/** Ensures organizationId is set (superAdmin must pass ?orgId=). */
export const requireOrgScope = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!getScopedOrganizationId(req, res)) {
    res.status(400).json({
      success: false,
      data: null,
      message: "organizationId is required (org users: automatic; superAdmin: pass ?orgId=)"
    });
    return;
  }
  next();
};
