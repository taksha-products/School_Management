"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgFilter = exports.getScopedOrganizationId = void 0;
const mongoose_1 = require("mongoose");
/** Resolved organization scope (set by orgScope middleware on res.locals). */
const getScopedOrganizationId = (req, res) => {
    if (res.locals.organizationId !== undefined) {
        return res.locals.organizationId;
    }
    return req.user?.organizationId ?? null;
};
exports.getScopedOrganizationId = getScopedOrganizationId;
const orgFilter = (req, res) => {
    const orgId = (0, exports.getScopedOrganizationId)(req, res);
    if (!orgId) {
        return {};
    }
    return { organizationId: new mongoose_1.Types.ObjectId(orgId) };
};
exports.orgFilter = orgFilter;
