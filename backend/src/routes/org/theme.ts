import { Router } from "express";

import { auth, type AuthenticatedRequest } from "../../middleware/auth";
import { getOrgTheme } from "../../services/orgThemeService";
import { asyncHandler } from "../../utils/asyncHandler";

const orgThemeRouter = Router();

orgThemeRouter.get(
  "/",
  auth,
  asyncHandler(async (req, res) => {
    const authReq = req as AuthenticatedRequest;
    const orgId = authReq.user?.organizationId;

    if (!orgId) {
      res.status(404).json({
        success: false,
        data: null,
        message: "No organization theme available"
      });
      return;
    }

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
      message: "Organization theme fetched successfully"
    });
  })
);

export default orgThemeRouter;
