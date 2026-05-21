import type { NextFunction, Response } from "express";

import type { AuthenticatedRequest } from "./auth";
import { isOrgAdmin } from "./roleCheck";

export const isSuperAdminOrOrgAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role === "superAdmin") {
    next();
    return;
  }
  isOrgAdmin(req, res, next);
};
