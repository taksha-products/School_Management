"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useCallback, useState, type JSX } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { OrgBrandingForm } from "@/components/shared/OrgBrandingForm";
import { useToast } from "@/components/ui/Toast";
import { orgThemeQueryKey, useOrgTheme } from "@/hooks/useOrgTheme";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import type { OrgTheme } from "@/types/orgTheme";

const BrandingSettingsPage = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { theme } = useOrgTheme();
  const orgId = getUser()?.organizationId ?? null;
  const [formKey, setFormKey] = useState(0);

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
        await api.post<{ data: OrgTheme }>("/api/admin/settings/branding", formData, {
          headers: { "Content-Type": "multipart/form-data" }
        })
      ).data.data;
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(orgThemeQueryKey(orgId), updated);
      queryClient.invalidateQueries({ queryKey: orgThemeQueryKey(orgId) });
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

  return (
    <PageWrapper
      title="Branding"
      subtitle="Customize how your school appears to staff and parents in the portal, receipts, and payment screens."
    >
      <OrgBrandingForm key={formKey} theme={theme} isSaving={saveMutation.isPending} onSave={handleSave} />
    </PageWrapper>
  );
};

export default BrandingSettingsPage;
