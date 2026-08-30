"use client";

import { useEffect, useState, type JSX } from "react";

import { Button } from "@/components/ui/Button";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import {
  ORGANIZATION_FEATURE_DEFINITIONS,
  resolveOrganizationFeatures,
  type OrganizationFeatures
} from "@/types/organization";
import type { Organization } from "@/types/schoolFees";

interface OrgFeaturesPanelProps {
  organization: Organization;
  onSaved: () => void;
}

export const OrgFeaturesPanel = ({ organization, onSaved }: OrgFeaturesPanelProps): JSX.Element => {
  const { showToast } = useToast();
  const [features, setFeatures] = useState<OrganizationFeatures>(
    resolveOrganizationFeatures(organization.features)
  );
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setFeatures(resolveOrganizationFeatures(organization.features));
  }, [organization.features]);

  const handleSave = async (): Promise<void> => {
    setSaving(true);
    try {
      await api.patch(`/api/superadmin/organizations/${organization._id}/features`, {
        features
      });
      showToast("success", "Features updated successfully");
      onSaved();
    } catch {
      showToast("error", "Failed to update features");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Enable or disable modules for this organization. Changes take effect immediately for all
        users in the school.
      </p>
      <div className="space-y-3">
        {ORGANIZATION_FEATURE_DEFINITIONS.map((def) => (
          <div
            key={def.key}
            className="flex items-start justify-between gap-4 rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3"
          >
            <div className="min-w-0 flex-1">
              <p className="font-medium text-gray-900">{def.label}</p>
              <p className="mt-0.5 text-sm text-gray-500">{def.description}</p>
            </div>
            <Switch
              checked={features[def.key]}
              label={def.label}
              onCheckedChange={(checked) =>
                setFeatures((prev) => ({ ...prev, [def.key]: checked }))
              }
            />
          </div>
        ))}
      </div>
      <Button onClick={() => void handleSave()} disabled={saving}>
        {saving ? "Saving…" : "Save features"}
      </Button>
    </div>
  );
};
