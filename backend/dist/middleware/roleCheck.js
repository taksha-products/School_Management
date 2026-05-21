"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.parentStudentFilter = exports.canReadOrgData = exports.canAccessOrg = exports.isParent = exports.isSuperAdminOrOrgStaffAny = exports.isSuperAdminOrOrgStaff = exports.isOrgAdminOrStaff = exports.isOrgAdminOrStaffAny = exports.isStaff = exports.isOrgAdmin = exports.isSuperAdmin = void 0;
const mongoose_1 = require("mongoose");
const orgFilter_1 = require("../utils/orgFilter");
const forbidden = (res, message) => {
    res.status(403).json({ success: false, data: null, message });
};
const isSuperAdmin = (req, res, next) => {
    if (req.user?.role !== "superAdmin") {
        forbidden(res, "Forbidden: super admin access required");
        return;
    }
    next();
};
exports.isSuperAdmin = isSuperAdmin;
const isOrgAdmin = (req, res, next) => {
    if (req.user?.role !== "orgAdmin") {
        forbidden(res, "Forbidden: organization admin access required");
        return;
    }
    const scopedOrg = (0, orgFilter_1.getScopedOrganizationId)(req, res);
    if (!scopedOrg || req.user.organizationId !== scopedOrg) {
        forbidden(res, "Forbidden: organization access denied");
        return;
    }
    next();
};
exports.isOrgAdmin = isOrgAdmin;
const isStaff = (permission) => (req, res, next) => {
    if (req.user?.role !== "staff") {
        forbidden(res, "Forbidden: staff access required");
        return;
    }
    const scopedOrg = (0, orgFilter_1.getScopedOrganizationId)(req, res);
    if (!scopedOrg || req.user.organizationId !== scopedOrg) {
        forbidden(res, "Forbidden: organization access denied");
        return;
    }
    if (!req.user.staffPermissions?.[permission]) {
        forbidden(res, `Forbidden: missing staff permission '${permission}'`);
        return;
    }
    next();
};
exports.isStaff = isStaff;
const isOrgAdminOrStaffAny = (...permissions) => (req, res, next) => {
    if (!req.user) {
        forbidden(res, "Forbidden");
        return;
    }
    const scopedOrg = (0, orgFilter_1.getScopedOrganizationId)(req, res);
    if (!scopedOrg || req.user.organizationId !== scopedOrg) {
        forbidden(res, "Forbidden: organization access denied");
        return;
    }
    if (req.user.role === "orgAdmin") {
        next();
        return;
    }
    if (req.user.role === "staff") {
        const perms = req.user.staffPermissions;
        if (permissions.length === 0 ||
            permissions.some((p) => perms?.[p])) {
            next();
            return;
        }
        forbidden(res, "Forbidden: insufficient staff permissions");
        return;
    }
    forbidden(res, "Forbidden: organization admin or staff access required");
};
exports.isOrgAdminOrStaffAny = isOrgAdminOrStaffAny;
const isOrgAdminOrStaff = (permission) => (req, res, next) => {
    if (!req.user) {
        forbidden(res, "Forbidden");
        return;
    }
    const scopedOrg = (0, orgFilter_1.getScopedOrganizationId)(req, res);
    if (!scopedOrg || req.user.organizationId !== scopedOrg) {
        forbidden(res, "Forbidden: organization access denied");
        return;
    }
    if (req.user.role === "orgAdmin") {
        next();
        return;
    }
    if (req.user.role === "staff") {
        if (!permission || req.user.staffPermissions?.[permission]) {
            next();
            return;
        }
        forbidden(res, `Forbidden: missing staff permission '${permission}'`);
        return;
    }
    forbidden(res, "Forbidden: organization admin or staff access required");
};
exports.isOrgAdminOrStaff = isOrgAdminOrStaff;
const isSuperAdminOrOrgStaff = (permission) => (req, res, next) => {
    if (req.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, exports.isOrgAdminOrStaff)(permission)(req, res, next);
};
exports.isSuperAdminOrOrgStaff = isSuperAdminOrOrgStaff;
const isSuperAdminOrOrgStaffAny = (...permissions) => (req, res, next) => {
    if (req.user?.role === "superAdmin") {
        next();
        return;
    }
    (0, exports.isOrgAdminOrStaffAny)(...permissions)(req, res, next);
};
exports.isSuperAdminOrOrgStaffAny = isSuperAdminOrOrgStaffAny;
const isParent = (req, res, next) => {
    if (req.user?.role !== "parent") {
        forbidden(res, "Forbidden: parent access required");
        return;
    }
    const scopedOrg = (0, orgFilter_1.getScopedOrganizationId)(req, res);
    if (!scopedOrg || req.user.organizationId !== scopedOrg) {
        forbidden(res, "Forbidden: organization access denied");
        return;
    }
    next();
};
exports.isParent = isParent;
/** SuperAdmin bypasses; others must match scoped organizationId. */
const canAccessOrg = (req, res, next) => {
    if (!req.user) {
        forbidden(res, "Forbidden");
        return;
    }
    if (req.user.role === "superAdmin") {
        next();
        return;
    }
    const scopedOrg = (0, orgFilter_1.getScopedOrganizationId)(req, res);
    if (!scopedOrg || !req.user.organizationId) {
        forbidden(res, "Forbidden: organization scope required");
        return;
    }
    if (req.user.organizationId !== scopedOrg) {
        forbidden(res, "Forbidden: cannot access this organization");
        return;
    }
    next();
};
exports.canAccessOrg = canAccessOrg;
/** Read access: orgAdmin, staff (any permission), or parent (own students only in route). */
const canReadOrgData = (req, res, next) => {
    if (!req.user) {
        forbidden(res, "Forbidden");
        return;
    }
    if (req.user.role === "superAdmin") {
        next();
        return;
    }
    const scopedOrg = (0, orgFilter_1.getScopedOrganizationId)(req, res);
    if (!scopedOrg || req.user.organizationId !== scopedOrg) {
        forbidden(res, "Forbidden: organization access denied");
        return;
    }
    const allowedRoles = ["orgAdmin", "staff", "parent"];
    if (!allowedRoles.includes(req.user.role)) {
        forbidden(res, "Forbidden: insufficient role for read access");
        return;
    }
    next();
};
exports.canReadOrgData = canReadOrgData;
const parentStudentFilter = (req) => {
    if (req.user?.role !== "parent" || !req.user.parentStudentIds?.length) {
        return { _id: { $in: [] } };
    }
    return {
        _id: { $in: req.user.parentStudentIds.map((id) => new mongoose_1.Types.ObjectId(id)) }
    };
};
exports.parentStudentFilter = parentStudentFilter;
