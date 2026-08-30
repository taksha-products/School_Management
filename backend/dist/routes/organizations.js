"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const orgScope_1 = require("../middleware/orgScope");
const requireOrgScope_1 = require("../middleware/requireOrgScope");
const roleCheck_1 = require("../middleware/roleCheck");
const Organization_1 = require("../models/Organization");
const asyncHandler_1 = require("../utils/asyncHandler");
const orgFilter_1 = require("../utils/orgFilter");
const orgGradeConfig_1 = require("../utils/orgGradeConfig");
const organizationsRouter = (0, express_1.Router)();
const guard = [auth_1.auth, orgScope_1.orgScope, requireOrgScope_1.requireOrgScope, roleCheck_1.canAccessOrg];
organizationsRouter.get("/config", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const org = await Organization_1.Organization.findById(orgId).select("institutionType grades");
    if (!org) {
        res.status(404).json({ success: false, data: null, message: "Organization not found" });
        return;
    }
    res.json({
        success: true,
        data: (0, orgGradeConfig_1.resolveOrgGradeConfig)(org),
        message: "Organization config fetched successfully"
    });
}));
exports.default = organizationsRouter;
