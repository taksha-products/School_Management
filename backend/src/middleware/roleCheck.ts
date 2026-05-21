import type { NextFunction, Response } from "express";
import { Types } from "mongoose";

import type { StaffPermissions } from "../models/User";
import { getScopedOrganizationId } from "../utils/orgFilter";
import type { AuthenticatedRequest } from "./auth";

const forbidden = (res: Response, message: string): void => {
  res.status(403).json({ success: false, data: null, message });
};

export const isSuperAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== "superAdmin") {
    forbidden(res, "Forbidden: super admin access required");
    return;
  }
  next();
};

export const isOrgAdmin = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== "orgAdmin") {
    forbidden(res, "Forbidden: organization admin access required");
    return;
  }
  const scopedOrg = getScopedOrganizationId(req, res);
  if (!scopedOrg || req.user.organizationId !== scopedOrg) {
    forbidden(res, "Forbidden: organization access denied");
    return;
  }
  next();
};

export const isStaff =
  (permission: keyof StaffPermissions) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.user?.role !== "staff") {
      forbidden(res, "Forbidden: staff access required");
      return;
    }
    const scopedOrg = getScopedOrganizationId(req, res);
    if (!scopedOrg || req.user.organizationId !== scopedOrg) {
      forbidden(res, "Forbidden: organization access denied");
      return;
    }
    if (!req.user.staffPermissions?.[permission]) {
      forbidden(res, `Forbidden: missing staff permission '${permission}'`);
      return;
    }
    next();
  };

export const isOrgAdminOrStaffAny =
  (...permissions: (keyof StaffPermissions)[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      forbidden(res, "Forbidden");
      return;
    }

    const scopedOrg = getScopedOrganizationId(req, res);
    if (!scopedOrg || req.user.organizationId !== scopedOrg) {
      forbidden(res, "Forbidden: organization access denied");
      return;
    }

    if (req.user.role === "orgAdmin") {
      next();
      return;
    }

    if (req.user.role === "staff") {
      const perms = req.user.staffPermissions;
      if (
        permissions.length === 0 ||
        permissions.some((p) => perms?.[p])
      ) {
        next();
        return;
      }
      forbidden(res, "Forbidden: insufficient staff permissions");
      return;
    }

    forbidden(res, "Forbidden: organization admin or staff access required");
  };

export const isOrgAdminOrStaff =
  (permission?: keyof StaffPermissions) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (!req.user) {
      forbidden(res, "Forbidden");
      return;
    }

    const scopedOrg = getScopedOrganizationId(req, res);
    if (!scopedOrg || req.user.organizationId !== scopedOrg) {
      forbidden(res, "Forbidden: organization access denied");
      return;
    }

    if (req.user.role === "orgAdmin") {
      next();
      return;
    }

    if (req.user.role === "staff") {
      if (!permission || req.user.staffPermissions?.[permission]) {
        next();
        return;
      }
      forbidden(res, `Forbidden: missing staff permission '${permission}'`);
      return;
    }

    forbidden(res, "Forbidden: organization admin or staff access required");
  };

export const isSuperAdminOrOrgStaff =
  (permission?: keyof StaffPermissions) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.user?.role === "superAdmin") {
      next();
      return;
    }
    isOrgAdminOrStaff(permission)(req, res, next);
  };

export const isSuperAdminOrOrgStaffAny =
  (...permissions: (keyof StaffPermissions)[]) =>
  (req: AuthenticatedRequest, res: Response, next: NextFunction): void => {
    if (req.user?.role === "superAdmin") {
      next();
      return;
    }
    isOrgAdminOrStaffAny(...permissions)(req, res, next);
  };

export const isParent = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (req.user?.role !== "parent") {
    forbidden(res, "Forbidden: parent access required");
    return;
  }
  const scopedOrg = getScopedOrganizationId(req, res);
  if (!scopedOrg || req.user.organizationId !== scopedOrg) {
    forbidden(res, "Forbidden: organization access denied");
    return;
  }
  next();
};

/** SuperAdmin bypasses; others must match scoped organizationId. */
export const canAccessOrg = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    forbidden(res, "Forbidden");
    return;
  }

  if (req.user.role === "superAdmin") {
    next();
    return;
  }

  const scopedOrg = getScopedOrganizationId(req, res);
  if (!scopedOrg || !req.user.organizationId) {
    forbidden(res, "Forbidden: organization scope required");
    return;
  }

  if (req.user.organizationId !== scopedOrg) {
    forbidden(res, "Forbidden: cannot access this organization");
    return;
  }

  next();
};

/** Read access: orgAdmin, staff (any permission), or parent (own students only in route). */
export const canReadOrgData = (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): void => {
  if (!req.user) {
    forbidden(res, "Forbidden");
    return;
  }

  if (req.user.role === "superAdmin") {
    next();
    return;
  }

  const scopedOrg = getScopedOrganizationId(req, res);
  if (!scopedOrg || req.user.organizationId !== scopedOrg) {
    forbidden(res, "Forbidden: organization access denied");
    return;
  }

  const allowedRoles = ["orgAdmin", "staff", "parent"] as const;
  if (!allowedRoles.includes(req.user.role as (typeof allowedRoles)[number])) {
    forbidden(res, "Forbidden: insufficient role for read access");
    return;
  }

  next();
};

export const parentStudentFilter = (req: AuthenticatedRequest): Record<string, unknown> => {
  if (req.user?.role !== "parent" || !req.user.parentStudentIds?.length) {
    return { _id: { $in: [] } };
  }
  return {
    _id: { $in: req.user.parentStudentIds.map((id) => new Types.ObjectId(id)) }
  };
};
