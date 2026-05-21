"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orgScope = void 0;
/**
 * Resolves organization scope from JWT only.
 * superAdmin may pass ?orgId=; never trust organizationId from body or query otherwise.
 */
const orgScope = (req, res, next) => {
    if (!req.user) {
        res.status(401).json({
            success: false,
            data: null,
            message: "Unauthorized"
        });
        return;
    }
    const orgId = req.user.role === "superAdmin"
        ? req.query.orgId || null
        : req.user.organizationId ?? null;
    if (req.user.role !== "superAdmin" && !orgId) {
        res.status(403).json({
            success: false,
            data: null,
            message: "Forbidden: user is not linked to an organization"
        });
        return;
    }
    if (req.body && typeof req.body === "object" && "organizationId" in req.body) {
        delete req.body.organizationId;
    }
    res.locals.organizationId = orgId;
    next();
};
exports.orgScope = orgScope;
