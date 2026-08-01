"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import type { JSX } from "react";

import { ResetAdminPasswordModal } from "@/components/superadmin/ResetAdminPasswordModal";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { Switch } from "@/components/ui/Switch";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { Organization } from "@/types/schoolFees";
import type { OrgAdminResponse } from "@/types/superadmin";
import {
  ORGANIZATION_FEATURE_DEFINITIONS,
  resolveOrganizationFeatures,
  type OrganizationFeatures
} from "@/types/organization";
import { cn } from "@/lib/utils";

type OrgDetailTab = "features" | "admin";

interface EditFeaturesModalProps {
  organization: Organization | null;
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export const EditFeaturesModal = ({
  organization,
  isOpen,
  onClose,
  onSaved
}: EditFeaturesModalProps): JSX.Element | null => {
  const { showToast } = useToast();
  const [activeTab, setActiveTab] = useState<OrgDetailTab>("features");
  const [features, setFeatures] = useState<OrganizationFeatures>(
    resolveOrganizationFeatures(undefined)
  );
  const [saving, setSaving] = useState(false);
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);

  const adminQuery = useQuery({
    queryKey: ["super-org-admin", organization?._id],
    queryFn: async () =>
      (await api.get<OrgAdminResponse>(`/api/superadmin/organizations/${organization!._id}/admin`))
        .data.data,
    enabled: isOpen && !!organization && activeTab === "admin"
  });

  useEffect(() => {
    if (organization) {
      setFeatures(resolveOrganizationFeatures(organization.features));
    }
  }, [organization]);

  useEffect(() => {
    if (!isOpen) {
      setActiveTab("features");
      setResetPasswordOpen(false);
    }
  }, [isOpen]);

  const handleSave = async (): Promise<void> => {
    if (!organization) return;

    setSaving(true);
    try {
      await api.patch(`/api/superadmin/organizations/${organization._id}/features`, {
        features
      });
      showToast("success", "Features updated successfully");
      onSaved();
      onClose();
    } catch {
      showToast("error", "Failed to update features");
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen || !organization) {
    return null;
  }

  const admin = adminQuery.data;

  return (
    <>
      <Modal
        isOpen={isOpen}
        title={organization.name}
        onClose={onClose}
        size="large"
        footer={
          activeTab === "features" ? (
            <>
              <Button variant="secondary" onClick={onClose} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void handleSave()} disabled={saving}>
                {saving ? "Saving…" : "Save"}
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={onClose}>
              Close
            </Button>
          )
        }
      >
        <div className="mb-4 flex gap-1 rounded-lg border border-gray-100 bg-gray-50 p-1">
          {(
            [
              { id: "features" as const, label: "Features" },
              { id: "admin" as const, label: "Admin Account" }
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex-1 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                activeTab === tab.id
                  ? "bg-white text-gray-900 shadow-sm"
                  : "text-gray-500 hover:text-gray-700"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "features" ? (
          <>
            <p className="mb-4 text-sm text-gray-500">
              Enable or disable modules for this organization. Changes take effect immediately for
              all users in the school.
            </p>
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
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
          </>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Primary organization admin account used to sign in to the school portal.
            </p>

            {adminQuery.isLoading ? (
              <p className="text-sm text-gray-500">Loading admin account…</p>
            ) : adminQuery.isError ? (
              <p className="text-sm text-red-600">Could not load admin account.</p>
            ) : admin ? (
              <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3 space-y-3">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Name</p>
                  <p className="mt-0.5 font-medium text-gray-900">{admin.name}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Email</p>
                  <p className="mt-0.5 text-gray-900">{admin.email}</p>
                </div>
                <div>
                  <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                    Member since
                  </p>
                  <p className="mt-0.5 text-gray-900">
                    {new Date(admin.createdAt).toLocaleDateString("en-IN", {
                      day: "numeric",
                      month: "long",
                      year: "numeric"
                    })}
                  </p>
                </div>
                {admin.lastLogin && (
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
                      Last login
                    </p>
                    <p className="mt-0.5 text-gray-900">
                      {new Date(admin.lastLogin).toLocaleString("en-IN")}
                    </p>
                  </div>
                )}
              </div>
            ) : null}

            <Button
              variant="secondary"
              onClick={() => setResetPasswordOpen(true)}
              disabled={adminQuery.isLoading || adminQuery.isError || !admin}
            >
              Reset Password
            </Button>
          </div>
        )}
      </Modal>

      <ResetAdminPasswordModal
        organizationId={organization._id}
        organizationName={organization.name}
        isOpen={resetPasswordOpen}
        onClose={() => setResetPasswordOpen(false)}
      />
    </>
  );
};
