"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const uploadLogo_1 = require("../../middleware/uploadLogo");
const orgScope_1 = require("../../middleware/orgScope");
const roleCheck_1 = require("../../middleware/roleCheck");
const orgThemeService_1 = require("../../services/orgThemeService");
const orgBrandingService_1 = require("../../services/orgBrandingService");
const asyncHandler_1 = require("../../utils/asyncHandler");
const orgFilter_1 = require("../../utils/orgFilter");
const adminBrandingRouter = (0, express_1.Router)();
const guard = [auth_1.auth, orgScope_1.orgScope, roleCheck_1.isOrgAdmin];
adminBrandingRouter.post("/", ...guard, (req, res, next) => {
    (0, uploadLogo_1.uploadLogo)(req, res, (error) => {
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
}, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const result = await (0, orgBrandingService_1.updateOrganizationBranding)(orgId, req.body, req.file
        ? { buffer: req.file.buffer, mimetype: req.file.mimetype }
        : undefined);
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
}));
adminBrandingRouter.get("/", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const theme = await (0, orgThemeService_1.getOrgTheme)(orgId);
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
}));
exports.default = adminBrandingRouter;
