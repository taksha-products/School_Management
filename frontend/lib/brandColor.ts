import { DEFAULT_BRAND_COLOR } from "@/types/orgTheme";

const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/;

const clamp = (value: number): number => Math.max(0, Math.min(255, Math.round(value)));

const parseHex = (hex: string): { r: number; g: number; b: number } | null => {
  if (!HEX_PATTERN.test(hex)) {
    return null;
  }
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16)
  };
};

const toHex = (r: number, g: number, b: number): string =>
  `#${[r, g, b].map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;

const mixWithWhite = (hex: string, whiteRatio: number): string => {
  const rgb = parseHex(hex);
  if (!rgb) {
    return hex;
  }
  const colorRatio = 1 - whiteRatio;
  return toHex(
    clamp(rgb.r * colorRatio + 255 * whiteRatio),
    clamp(rgb.g * colorRatio + 255 * whiteRatio),
    clamp(rgb.b * colorRatio + 255 * whiteRatio)
  );
};

const darken = (hex: string, amount: number): string => {
  const rgb = parseHex(hex);
  if (!rgb) {
    return hex;
  }
  const factor = 1 - amount;
  return toHex(clamp(rgb.r * factor), clamp(rgb.g * factor), clamp(rgb.b * factor));
};

export const normalizeBrandColor = (brandColor?: string | null): string => {
  if (brandColor && HEX_PATTERN.test(brandColor)) {
    return brandColor;
  }
  return DEFAULT_BRAND_COLOR;
};

export const applyBrandTheme = (brandColor?: string | null): void => {
  const base = normalizeBrandColor(brandColor);
  const root = document.documentElement;

  root.style.setProperty("--brand-color", base);
  root.style.setProperty("--color-primary", base);
  root.style.setProperty("--brand-color-hover", darken(base, 0.08));
  root.style.setProperty("--brand-color-50", mixWithWhite(base, 0.92));
  root.style.setProperty("--brand-color-100", mixWithWhite(base, 0.85));
  root.style.setProperty("--brand-color-200", mixWithWhite(base, 0.7));
  root.style.setProperty("--color-border-focus", base);
};

export const getOrgDisplayLabel = (theme: {
  displayName?: string | null;
  orgName?: string;
}): string => theme.displayName?.trim() || theme.orgName || "School";

export const mixBrandColorWithWhite = (hex: string, whiteRatio: number): string =>
  mixWithWhite(normalizeBrandColor(hex), whiteRatio);
