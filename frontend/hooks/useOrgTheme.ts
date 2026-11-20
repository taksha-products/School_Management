"use client";

import { useQuery } from "@tanstack/react-query";

import { getUser } from "@/lib/auth";
import { api } from "@/lib/api";
import { getOrgDisplayLabel, normalizeBrandColor } from "@/lib/brandColor";
import type { OrgTheme } from "@/types/orgTheme";

const THEME_STALE_MS = 5 * 60 * 1000;

const emptyTheme: OrgTheme = {
  logoUrl: null,
  brandColor: null,
  displayName: null,
  orgName: "School"
};

export const useOrgTheme = (): {
  theme: OrgTheme;
  isLoading: boolean;
  displayLabel: string;
  brandColor: string;
} => {
  const orgId = getUser()?.organizationId ?? null;

  const query = useQuery({
    queryKey: ["org-theme", orgId ?? "session"],
    queryFn: async () =>
      (await api.get<{ data: OrgTheme }>("/api/org/theme")).data.data,
    staleTime: THEME_STALE_MS
  });

  const theme = query.data ?? emptyTheme;
  const brandColor = normalizeBrandColor(theme.brandColor);

  return {
    theme,
    isLoading: query.isLoading && !!orgId,
    displayLabel: getOrgDisplayLabel(theme),
    brandColor
  };
};

export const orgThemeQueryKey = (orgId: string | null): readonly [string, string | null] =>
  ["org-theme", orgId] as const;
