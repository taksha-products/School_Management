"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api";

interface OrgFeaturesResponse {
  enabledFeatures?: string[];
}

export const useOrgFeatures = (): {
  enabledFeatures: string[];
  isLoading: boolean;
} => {
  const query = useQuery({
    queryKey: ["org-features"],
    queryFn: async () =>
      (await api.get<{ data: OrgFeaturesResponse }>("/api/org/organization")).data.data
        .enabledFeatures ?? [],
    staleTime: 5 * 60 * 1000
  });

  return {
    enabledFeatures: query.data ?? [],
    isLoading: query.isLoading
  };
};

export const useFeatureEnabled = (feature: string): boolean => {
  const { enabledFeatures, isLoading } = useOrgFeatures();
  if (isLoading) {
    return false;
  }
  return enabledFeatures.includes(feature);
};
