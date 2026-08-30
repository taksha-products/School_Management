"use client";

import { useEffect, type JSX, type ReactNode } from "react";

import { useOrgTheme } from "@/hooks/useOrgTheme";
import { applyBrandTheme } from "@/lib/brandColor";

interface OrgThemeProviderProps {
  children: ReactNode;
}

export const OrgThemeProvider = ({ children }: OrgThemeProviderProps): JSX.Element => {
  const { brandColor } = useOrgTheme();

  useEffect(() => {
    applyBrandTheme(brandColor);
  }, [brandColor]);

  return <>{children}</>;
};
