"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getOrgBrandingLabel = exports.invalidateOrgThemeCache = exports.getOrgTheme = void 0;
const Organization_1 = require("../models/Organization");
const cache_1 = require("../utils/cache");
const THEME_CACHE_SUFFIX = "theme";
const THEME_CACHE_TTL_SECONDS = 300;
const getOrgTheme = async (organizationId) => {
    const cacheKey = (0, cache_1.orgCacheKey)(organizationId, THEME_CACHE_SUFFIX);
    const cached = await (0, cache_1.getCached)(cacheKey);
    if (cached) {
        return cached;
    }
    const org = await Organization_1.Organization.findById(organizationId).select("name logoUrl brandColor displayName");
    if (!org) {
        return null;
    }
    const theme = {
        logoUrl: org.logoUrl ?? null,
        brandColor: org.brandColor ?? null,
        displayName: org.displayName ?? null,
        orgName: org.name
    };
    await (0, cache_1.setCached)(cacheKey, theme, THEME_CACHE_TTL_SECONDS);
    return theme;
};
exports.getOrgTheme = getOrgTheme;
const invalidateOrgThemeCache = async (organizationId) => {
    await (0, cache_1.deleteCached)((0, cache_1.orgCacheKey)(organizationId, THEME_CACHE_SUFFIX));
};
exports.invalidateOrgThemeCache = invalidateOrgThemeCache;
const getOrgBrandingLabel = async (organizationId) => {
    const theme = await (0, exports.getOrgTheme)(organizationId);
    if (!theme) {
        return "School";
    }
    return theme.displayName ?? theme.orgName;
};
exports.getOrgBrandingLabel = getOrgBrandingLabel;
