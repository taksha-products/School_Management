import { Router } from "express";

import { auth, type AuthenticatedRequest } from "../../middleware/auth";
import { orgScope } from "../../middleware/orgScope";
import { isOrgAdmin } from "../../middleware/roleCheck";
import { Organization } from "../../models/Organization";
import { asyncHandler } from "../../utils/asyncHandler";
import { getScopedOrganizationId } from "../../utils/orgFilter";

const orgOrganizationRouter = Router();

const guard = [auth, orgScope, isOrgAdmin] as const;

orgOrganizationRouter.get(
  "/",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const org = await Organization.findById(orgId).select(
      "name code address phone email logo plan isActive currentAcademicYear features featureOverrides"
    );
    if (!org) {
      res.status(404).json({ success: false, data: null, message: "Organization not found" });
      return;
    }
    res.json({
      success: true,
      data: {
        ...org.toObject({ virtuals: true }),
        enabledFeatures: org.enabledFeatures
      },
      message: "Organization fetched successfully"
    });
  })
);

orgOrganizationRouter.patch(
  "/",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const { currentAcademicYear } = req.body as { currentAcademicYear?: string };

    const update: Record<string, unknown> = {};
    if (currentAcademicYear && /^\d{4}-\d{2}$/.test(currentAcademicYear)) {
      update.currentAcademicYear = currentAcademicYear;
    }

    const org = await Organization.findByIdAndUpdate(orgId, update, {
      new: true,
      runValidators: true
    });
    if (!org) {
      res.status(404).json({ success: false, data: null, message: "Organization not found" });
      return;
    }
    res.json({ success: true, data: org, message: "Organization updated successfully" });
  })
);

export default orgOrganizationRouter;
