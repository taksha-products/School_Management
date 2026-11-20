export interface OrgTheme {
  logoUrl: string | null;
  brandColor: string | null;
  displayName: string | null;
  orgName: string;
}

export interface ReceiptOrgBranding extends OrgTheme {
  address?: string | null;
  phone?: string | null;
  email?: string | null;
}

export const DEFAULT_BRAND_COLOR = "#F97316";
