import { Router } from "express";

import { auth, type AuthenticatedRequest } from "../../middleware/auth";
import { uploadLogo } from "../../middleware/uploadLogo";
import { orgScope } from "../../middleware/orgScope";
import { isOrgAdmin } from "../../middleware/roleCheck";
import { getOrgTheme } from "../../services/orgThemeService";
import { updateOrganizationBranding } from "../../services/orgBrandingService";
import { asyncHandler } from "../../utils/asyncHandler";
import { getScopedOrganizationId } from "../../utils/orgFilter";

const adminBrandingRouter = Router();

const guard = [auth, orgScope, isOrgAdmin] as const;

adminBrandingRouter.post(
  "/",
  ...guard,
  (req, res, next) => {
    uploadLogo(req, res, (error) => {
      if (error instanceof Error) {
        res.status(400).json({
          success: false,
          data: null,
          message: error.message
        });
        return;
      }
      next();
    });
  },
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;

    const result = await updateOrganizationBranding(
      orgId,
      req.body as { brandColor?: string; displayName?: string },
      req.file
        ? { buffer: req.file.buffer, mimetype: req.file.mimetype }
        : undefined
    );

    if (!result.ok) {
      res.status(result.status).json({
        success: false,
        data: null,
        message: result.message
      });
      return;
    }

    res.json({
      success: true,
      data: result.theme,
      message: "Branding updated successfully"
    });
  })
);

adminBrandingRouter.get(
  "/",
  ...guard,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = getScopedOrganizationId(authReq, res)!;
    const theme = await getOrgTheme(orgId);

    if (!theme) {
      res.status(404).json({
        success: false,
        data: null,
        message: "Organization not found"
      });
      return;
    }

    res.json({
      success: true,
      data: theme,
      message: "Branding fetched successfully"
    });
  })
);

export default adminBrandingRouter;
