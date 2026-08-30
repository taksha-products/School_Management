"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const orgThemeService_1 = require("../../services/orgThemeService");
const asyncHandler_1 = require("../../utils/asyncHandler");
const orgThemeRouter = (0, express_1.Router)();
orgThemeRouter.get("/", auth_1.auth, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = authReq.user?.organizationId;
    if (!orgId) {
        res.status(404).json({
            success: false,
            data: null,
            message: "No organization theme available"
        });
        return;
    }
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
        message: "Organization theme fetched successfully"
    });
}));
exports.default = orgThemeRouter;
