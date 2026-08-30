"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type JSX } from "react";

import { OrgBrandingForm } from "@/components/shared/OrgBrandingForm";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { OrgTheme } from "@/types/orgTheme";

interface OrgBrandingPanelProps {
  organizationId: string;
  organizationName: string;
}

const emptyTheme = (orgName: string): OrgTheme => ({
  logoUrl: null,
  brandColor: null,
  displayName: null,
  orgName
});

export const OrgBrandingPanel = ({
  organizationId,
  organizationName
}: OrgBrandingPanelProps): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [formKey, setFormKey] = useState(0);

  const themeQuery = useQuery({
    queryKey: ["super-org-branding", organizationId],
    queryFn: async () =>
      (
        await api.get<{ data: OrgTheme }>(
          `/api/superadmin/organizations/${organizationId}/branding`
        )
      ).data.data
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: {
      displayName: string;
      brandColor: string;
      logoFile: File | null;
    }) => {
      const formData = new FormData();
      formData.append("displayName", payload.displayName);
      formData.append("brandColor", payload.brandColor);
      if (payload.logoFile) {
        formData.append("logo", payload.logoFile);
      }
      return (
        await api.post<{ data: OrgTheme }>(
          `/api/superadmin/organizations/${organizationId}/branding`,
          formData,
          { headers: { "Content-Type": "multipart/form-data" } }
        )
      ).data.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(["super-org-branding", organizationId], updated);
      setFormKey((key) => key + 1);
      showToast("success", "Branding saved");
    },
    onError: () => showToast("error", "Failed to save branding")
  });

  const handleSave = useCallback(
    (payload: { displayName: string; brandColor: string; logoFile: File | null }) => {
      saveMutation.mutate(payload);
    },
    [saveMutation]
  );

  if (themeQuery.isLoading) {
    return <p className="text-sm text-gray-500">Loading branding…</p>;
  }

  if (themeQuery.isError) {
    return <p className="text-sm text-red-600">Could not load branding settings.</p>;
  }

  return (
    <OrgBrandingForm
      key={formKey}
      theme={themeQuery.data ?? emptyTheme(organizationName)}
      isSaving={saveMutation.isPending}
      onSave={handleSave}
      description="Set up portal branding during onboarding so staff and parents see the school's identity from day one."
    />
  );
};
