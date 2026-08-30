import { Organization } from "../models/Organization";
import { saveOrganizationLogo } from "../utils/logoStorage";
import {
  invalidateOrgThemeCache,
  type OrgThemeResponse
} from "./orgThemeService";

const HEX_COLOR_PATTERN = /^#[0-9A-Fa-f]{6}$/;

export interface BrandingUpdateBody {
  brandColor?: unknown;
  displayName?: unknown;
}

export interface BrandingUpdateFiles {
  buffer?: Buffer;
  mimetype?: string;
}

export type BrandingUpdateError = {
  ok: false;
  status: number;
  message: string;
};

export type BrandingUpdateSuccess = {
  ok: true;
  theme: OrgThemeResponse;
};

export type BrandingUpdateResult = BrandingUpdateError | BrandingUpdateSuccess;

const parseOptionalBrandColor = (value: unknown): string | null | undefined => {
  if (value === undefined) {
    return undefined;
  }
  if (value === null || value === "") {
    return null;
  }
  const normalized = String(value).trim();
  if (!HEX_COLOR_PATTERN.test(normalized)) {
    return undefined;
  }
  return normalized;
};

export const updateOrganizationBranding = async (
  orgId: string,
  body: BrandingUpdateBody,
  file?: BrandingUpdateFiles
): Promise<BrandingUpdateResult> => {
  const brandColor = parseOptionalBrandColor(body.brandColor);
  if (body.brandColor !== undefined && brandColor === undefined) {
    return {
      ok: false,
      status: 400,
      message: "brandColor must be a valid hex color (e.g. #1A56DB)"
    };
  }

  const update: Record<string, unknown> = {};

  if (body.displayName !== undefined) {
    const trimmed = String(body.displayName).trim();
    update.displayName = trimmed.length > 0 ? trimmed : null;
  }

  if (brandColor !== undefined) {
    update.brandColor = brandColor;
  }

  if (file?.buffer && file.mimetype) {
    update.logoUrl = saveOrganizationLogo(orgId, file.buffer, file.mimetype);
  }

  if (Object.keys(update).length === 0) {
    return {
      ok: false,
      status: 400,
      message: "No branding fields to update"
    };
  }

  const org = await Organization.findByIdAndUpdate(orgId, update, {
    new: true,
    runValidators: true
  }).select("name logoUrl brandColor displayName");

  if (!org) {
    return {
      ok: false,
      status: 404,
      message: "Organization not found"
    };
  }

  await invalidateOrgThemeCache(orgId);

  return {
    ok: true,
    theme: {
      logoUrl: org.logoUrl ?? null,
      brandColor: org.brandColor ?? null,
      displayName: org.displayName ?? null,
      orgName: org.name
    }
  };
};
