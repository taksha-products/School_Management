"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../../middleware/auth");
const orgScope_1 = require("../../middleware/orgScope");
const roleCheck_1 = require("../../middleware/roleCheck");
const Organization_1 = require("../../models/Organization");
const asyncHandler_1 = require("../../utils/asyncHandler");
const orgFilter_1 = require("../../utils/orgFilter");
const orgOrganizationRouter = (0, express_1.Router)();
const guard = [auth_1.auth, orgScope_1.orgScope, roleCheck_1.isOrgAdmin];
orgOrganizationRouter.get("/", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const org = await Organization_1.Organization.findById(orgId).select("name code address phone email logo plan isActive currentAcademicYear features featureOverrides");
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
}));
orgOrganizationRouter.patch("/", ...guard, (0, asyncHandler_1.asyncHandler)(async (req, res) => {
    const authReq = req;
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    const { currentAcademicYear } = req.body;
    const update = {};
    if (currentAcademicYear && /^\d{4}-\d{2}$/.test(currentAcademicYear)) {
        update.currentAcademicYear = currentAcademicYear;
    }
    const org = await Organization_1.Organization.findByIdAndUpdate(orgId, update, {
        new: true,
        runValidators: true
    });
    if (!org) {
        res.status(404).json({ success: false, data: null, message: "Organization not found" });
        return;
    }
    res.json({ success: true, data: org, message: "Organization updated successfully" });
}));
exports.default = orgOrganizationRouter;
