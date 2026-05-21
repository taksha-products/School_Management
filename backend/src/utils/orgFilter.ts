import type { Response } from "express";
import { Types } from "mongoose";

import type { AuthenticatedRequest } from "../middleware/auth";

/** Resolved organization scope (set by orgScope middleware on res.locals). */
export const getScopedOrganizationId = (
  req: AuthenticatedRequest,
  res: Response
): string | null => {
  if (res.locals.organizationId !== undefined) {
    return res.locals.organizationId;
  }
  return req.user?.organizationId ?? null;
};

export const orgFilter = (
  req: AuthenticatedRequest,
  res: Response
): Record<string, unknown> => {
  const orgId = getScopedOrganizationId(req, res);
  if (!orgId) {
    return {};
  }
  return { organizationId: new Types.ObjectId(orgId) };
};
