import type { RequestHandler, Response } from "express";

import {
  ORGANIZATION_FEATURE_KEYS,
  Organization,
  type OrganizationFeatures,
  resolveFeatureEnabled
} from "../models/Organization";
import { asyncHandler } from "../utils/asyncHandler";
import { deleteCached, getCached, orgCacheKey, setCached } from "../utils/cache";
import { getScopedOrganizationId } from "../utils/orgFilter";
import type { AuthenticatedRequest } from "./auth";

const FEATURES_CACHE_TTL_SECONDS = 300;

interface CachedOrgFeatures {
  features: OrganizationFeatures;
  featureOverrides: Record<string, boolean>;
}

const mapOverridesToRecord = (
  overrides: Map<string, boolean> | Record<string, boolean> | undefined
): Record<string, boolean> => {
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
export const loadOrgFeatureContext = async (
  orgId: string
): Promise<CachedOrgFeatures | null> => {
  const cacheKey = orgCacheKey(orgId, "features");
  const cached = await getCached<CachedOrgFeatures>(cacheKey);
  if (cached) {
    return cached;
  }

  const org = await Organization.findById(orgId)
    .select("features featureOverrides")
    .lean<{ features: OrganizationFeatures; featureOverrides?: Map<string, boolean> }>();

  if (!org) {
    return null;
  }

  const payload: CachedOrgFeatures = {
    features: org.features,
    featureOverrides: mapOverridesToRecord(org.featureOverrides)
  };

  await setCached(cacheKey, payload, FEATURES_CACHE_TTL_SECONDS);
  return payload;
};

/**
 * Invalidates the Redis cache entry for an organization's feature flags.
 */
export const invalidateOrgFeaturesCache = async (orgId: string): Promise<void> => {
  await deleteCached(orgCacheKey(orgId, "features"));
};

/**
 * Returns whether a feature is enabled for an organization, or null if the org is missing.
 */
export const isOrgFeatureEnabled = async (
  orgId: string,
  flag: keyof OrganizationFeatures
): Promise<boolean | null> => {
  const context = await loadOrgFeatureContext(orgId);
  if (!context) {
    return null;
  }
  return resolveFeatureEnabled(context.features, context.featureOverrides, flag);
};

/**
 * Express middleware factory that enforces per-organization feature flags.
 * Requires orgScope (or equivalent) to have set organization scope on res.locals.
 * Super admins bypass all feature checks.
 */
export const requireFeature = (flag: keyof OrganizationFeatures): RequestHandler =>
  asyncHandler(async (req, res, next) => {
    const authReq = req as AuthenticatedRequest;

    if (authReq.user?.role === "superAdmin") {
      next();
      return;
    }

    const orgId = getScopedOrganizationId(authReq, res as Response);
    if (!orgId) {
      res.status(400).json({
        success: false,
        data: null,
        message:
          "organizationId is required (org users: automatic; superAdmin: pass ?orgId=)"
      });
      return;
    }

    const enabled = await isOrgFeatureEnabled(orgId, flag);
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

export { ORGANIZATION_FEATURE_KEYS };
