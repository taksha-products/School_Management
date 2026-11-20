import { Router } from "express";

import { auth, type AuthenticatedRequest } from "../middleware/auth";
import { orgScope } from "../middleware/orgScope";
import { requireOrgScope } from "../middleware/requireOrgScope";
import { canAccessOrg } from "../middleware/roleCheck";
import { Organization } from "../models/Organization";
import { asyncHandler } from "../utils/asyncHandler";
import { resolveAcademicYear } from "../utils/academicYear";
import { getScopedOrganizationId } from "../utils/orgFilter";
import { resolveOrgGradeConfig } from "../utils/orgGradeConfig";

const organizationsRouter = Router();

const guard = [auth, orgScope, requireOrgScope, canAccessOrg] as const;

organizationsRouter.get(
  "/config",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;

    const org = await Organization.findById(orgId).select(
      "institutionType grades currentAcademicYear"
    );

    if (!org) {
      res.status(404).json({ success: false, data: null, message: "Organization not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        ...resolveOrgGradeConfig(org),
        currentAcademicYear: resolveAcademicYear(org.currentAcademicYear)
      },
      message: "Organization config fetched successfully"
    });
  })
);

export default organizationsRouter;
