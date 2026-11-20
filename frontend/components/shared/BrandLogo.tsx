"use client";

import { Bus } from "lucide-react";
import type { JSX } from "react";

import { useOrgTheme } from "@/hooks/useOrgTheme";
import { getOrgDisplayLabel, normalizeBrandColor } from "@/lib/brandColor";
import type { ReceiptOrgBranding } from "@/types/orgTheme";

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export const BrandLogo = ({ compact = false, className = "" }: BrandLogoProps): JSX.Element => {
  const { theme, displayLabel } = useOrgTheme();

  if (theme.logoUrl) {
    return (
      <div className={`flex min-w-0 items-center ${className}`}>
        <img
          src={theme.logoUrl}
          alt={displayLabel}
          className={
            compact
              ? "max-h-8 w-auto max-w-[2rem] object-contain object-left"
              : "max-h-11 w-auto max-w-[min(100%,13rem)] object-contain object-left"
          }
        />
      </div>
    );
  }

  return (
    <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary">
        <Bus className="h-4 w-4 text-white" strokeWidth={2.5} />
      </div>
      {!compact && (
        <p className="truncate text-lg font-bold leading-tight text-gray-900">{displayLabel}</p>
      )}
    </div>
  );
};

interface ReceiptOrgHeaderProps {
  subtitle: string;
  branding?: ReceiptOrgBranding | null;
}

export const ReceiptOrgHeader = ({
  subtitle,
  branding
}: ReceiptOrgHeaderProps): JSX.Element => {
  const { theme, displayLabel } = useOrgTheme();
  const resolved = branding ?? theme;
  const label = getOrgDisplayLabel(resolved);
  const accentColor = normalizeBrandColor(resolved.brandColor);
  const contactLine = [branding?.address, branding?.phone, branding?.email]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-start gap-3">
        {resolved.logoUrl ? (
          <img
            src={resolved.logoUrl}
            alt={label}
            className="max-h-14 w-auto max-w-[120px] shrink-0 object-contain"
            crossOrigin="anonymous"
          />
        ) : (
          <div
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: accentColor }}
          >
            <Bus className="h-5 w-5 text-white" strokeWidth={2.5} />
          </div>
        )}
        <div className="min-w-0">
          <h1 className="text-lg font-bold leading-tight text-gray-900">{label}</h1>
          <p className="text-xs font-medium text-gray-500">{subtitle}</p>
          {contactLine ? (
            <p className="mt-1 text-[11px] leading-snug text-gray-500">{contactLine}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
};

export const ReceiptAccentBar = ({
  branding
}: {
  branding?: ReceiptOrgBranding | null;
}): JSX.Element => {
  const { theme } = useOrgTheme();
  const accentColor = normalizeBrandColor((branding ?? theme).brandColor);
  return <div className="mb-5 h-0.5 w-full" style={{ backgroundColor: accentColor }} />;
};
