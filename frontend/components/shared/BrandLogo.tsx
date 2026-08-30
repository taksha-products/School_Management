"use client";

import { Bus } from "lucide-react";
import type { JSX } from "react";

import { useOrgTheme } from "@/hooks/useOrgTheme";

interface BrandLogoProps {
  compact?: boolean;
  className?: string;
}

export const BrandLogo = ({ compact = false, className = "" }: BrandLogoProps): JSX.Element => {
  const { theme, displayLabel } = useOrgTheme();

  if (theme.logoUrl) {
    return (
      <div className={`flex min-w-0 items-center gap-2.5 ${className}`}>
        <img
          src={theme.logoUrl}
          alt={displayLabel}
          className="max-h-8 w-auto object-contain"
        />
        {!compact && (
          <p className="truncate text-lg font-bold leading-tight text-gray-900">{displayLabel}</p>
        )}
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
}

export const ReceiptOrgHeader = ({ subtitle }: ReceiptOrgHeaderProps): JSX.Element => {
  const { theme, displayLabel } = useOrgTheme();

  return (
    <div className="flex items-center gap-2.5">
      {theme.logoUrl ? (
        <img
          src={theme.logoUrl}
          alt={displayLabel}
          className="max-h-8 w-auto object-contain"
        />
      ) : (
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
          <Bus className="h-4 w-4 text-white" strokeWidth={2.5} />
        </div>
      )}
      <div>
        <h1 className="text-lg font-bold text-gray-900">{displayLabel}</h1>
        <p className="text-xs text-gray-500">{subtitle}</p>
      </div>
    </div>
  );
};
