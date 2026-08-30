import { Organization } from "../models/Organization";
import { deleteCached, getCached, orgCacheKey, setCached } from "../utils/cache";

export interface OrgThemeResponse {
  logoUrl: string | null;
  brandColor: string | null;
  displayName: string | null;
  orgName: string;
}

const THEME_CACHE_SUFFIX = "theme";
const THEME_CACHE_TTL_SECONDS = 300;

export const getOrgTheme = async (organizationId: string): Promise<OrgThemeResponse | null> => {
  const cacheKey = orgCacheKey(organizationId, THEME_CACHE_SUFFIX);
  const cached = await getCached<OrgThemeResponse>(cacheKey);
  if (cached) {
    return cached;
  }

  const org = await Organization.findById(organizationId).select(
    "name logoUrl brandColor displayName"
  );
  if (!org) {
    return null;
  }

  const theme: OrgThemeResponse = {
    logoUrl: org.logoUrl ?? null,
    brandColor: org.brandColor ?? null,
    displayName: org.displayName ?? null,
    orgName: org.name
  };

  await setCached(cacheKey, theme, THEME_CACHE_TTL_SECONDS);
  return theme;
};

export const invalidateOrgThemeCache = async (organizationId: string): Promise<void> => {
  await deleteCached(orgCacheKey(organizationId, THEME_CACHE_SUFFIX));
};

export const getOrgBrandingLabel = async (organizationId: string): Promise<string> => {
  const theme = await getOrgTheme(organizationId);
  if (!theme) {
    return "School";
  }
  return theme.displayName ?? theme.orgName;
};
