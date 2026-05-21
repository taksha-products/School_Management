"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireOrgScope = void 0;
const orgFilter_1 = require("../utils/orgFilter");
/** Ensures organizationId is set (superAdmin must pass ?orgId=). */
const requireOrgScope = (req, res, next) => {
    if (!(0, orgFilter_1.getScopedOrganizationId)(req, res)) {
        res.status(400).json({
            success: false,
            data: null,
            message: "organizationId is required (org users: automatic; superAdmin: pass ?orgId=)"
        });
        return;
    }
    next();
};
exports.requireOrgScope = requireOrgScope;
