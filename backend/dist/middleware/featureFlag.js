"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ORGANIZATION_FEATURE_KEYS = exports.requireFeature = exports.isOrgFeatureEnabled = exports.invalidateOrgFeaturesCache = exports.loadOrgFeatureContext = void 0;
const Organization_1 = require("../models/Organization");
Object.defineProperty(exports, "ORGANIZATION_FEATURE_KEYS", { enumerable: true, get: function () { return Organization_1.ORGANIZATION_FEATURE_KEYS; } });
const asyncHandler_1 = require("../utils/asyncHandler");
const cache_1 = require("../utils/cache");
const orgFilter_1 = require("../utils/orgFilter");
const FEATURES_CACHE_TTL_SECONDS = 300;
const mapOverridesToRecord = (overrides) => {
    if (!overrides) {
        return {};
    }
    if (overrides instanceof Map) {
        return Object.fromEntries(overrides.entries());
    }
    return overrides;
};
/**
 * Loads organization feature flags (Redis-cached) for API enforcement.
 * Returns null when the organization does not exist.
 */
const loadOrgFeatureContext = async (orgId) => {
    const cacheKey = (0, cache_1.orgCacheKey)(orgId, "features");
    const cached = await (0, cache_1.getCached)(cacheKey);
    if (cached) {
        return cached;
    }
    const org = await Organization_1.Organization.findById(orgId)
        .select("features featureOverrides")
        .lean();
    if (!org) {
        return null;
    }
    const payload = {
        features: org.features,
        featureOverrides: mapOverridesToRecord(org.featureOverrides)
    };
    await (0, cache_1.setCached)(cacheKey, payload, FEATURES_CACHE_TTL_SECONDS);
    return payload;
};
exports.loadOrgFeatureContext = loadOrgFeatureContext;
/**
 * Invalidates the Redis cache entry for an organization's feature flags.
 */
const invalidateOrgFeaturesCache = async (orgId) => {
    await (0, cache_1.deleteCached)((0, cache_1.orgCacheKey)(orgId, "features"));
};
exports.invalidateOrgFeaturesCache = invalidateOrgFeaturesCache;
/**
 * Returns whether a feature is enabled for an organization, or null if the org is missing.
 */
const isOrgFeatureEnabled = async (orgId, flag) => {
    const context = await (0, exports.loadOrgFeatureContext)(orgId);
    if (!context) {
        return null;
    }
    return (0, Organization_1.resolveFeatureEnabled)(context.features, context.featureOverrides, flag);
};
exports.isOrgFeatureEnabled = isOrgFeatureEnabled;
/**
 * Express middleware factory that enforces per-organization feature flags.
 * Requires orgScope (or equivalent) to have set organization scope on res.locals.
 * Super admins bypass all feature checks.
 */
const requireFeature = (flag) => (0, asyncHandler_1.asyncHandler)(async (req, res, next) => {
    const authReq = req;
    if (authReq.user?.role === "superAdmin") {
        next();
        return;
    }
    const orgId = (0, orgFilter_1.getScopedOrganizationId)(authReq, res);
    if (!orgId) {
        res.status(400).json({
            success: false,
            data: null,
            message: "organizationId is required (org users: automatic; superAdmin: pass ?orgId=)"
        });
        return;
    }
    const enabled = await (0, exports.isOrgFeatureEnabled)(orgId, flag);
    if (enabled === null) {
        res.status(404).json({
            success: false,
            data: null,
            message: "Organization not found"
        });
        return;
    }
    if (!enabled) {
        res.status(403).json({
            error: "Feature not enabled",
            feature: flag,
            code: "FEATURE_DISABLED"
        });
        return;
    }
    next();
});
exports.requireFeature = requireFeature;
