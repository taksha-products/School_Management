"use client";

import { useMutation } from "@tanstack/react-query";
import type { JSX } from "react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { Organization } from "@/types/schoolFees";

interface OrgOverviewPanelProps {
  organization: Organization;
  onUpdated: () => void;
}

export const OrgOverviewPanel = ({
  organization,
  onUpdated
}: OrgOverviewPanelProps): JSX.Element => {
  const { showToast } = useToast();

  const statusMutation = useMutation({
    mutationFn: async (isActive: boolean) =>
      api.put(`/api/superadmin/organizations/${organization._id}/status`, { isActive }),
    onSuccess: () => {
      showToast("success", "Organization status updated");
      onUpdated();
    },
    onError: () => showToast("error", "Failed to update organization status")
  });

  return (
    <div className="space-y-6">
      <dl className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">School name</dt>
          <dd className="mt-1 font-medium text-gray-900">{organization.name}</dd>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Code</dt>
          <dd className="mt-1 text-gray-900">{organization.code}</dd>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Plan</dt>
          <dd className="mt-1 capitalize text-gray-900">{organization.plan}</dd>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Status</dt>
          <dd className="mt-1 text-gray-900">{organization.isActive ? "Active" : "Inactive"}</dd>
        </div>
        <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
          <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Students</dt>
          <dd className="mt-1 text-gray-900">{organization.studentCount ?? 0}</dd>
        </div>
        {organization.createdAt && (
          <div className="rounded-lg border border-gray-100 bg-gray-50/50 px-4 py-3">
            <dt className="text-xs font-medium uppercase tracking-wide text-gray-400">Created</dt>
            <dd className="mt-1 text-gray-900">
              {new Date(organization.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "long",
                year: "numeric"
              })}
            </dd>
          </div>
        )}
      </dl>

      <Button
        variant={organization.isActive ? "danger" : "secondary"}
        onClick={() => statusMutation.mutate(!organization.isActive)}
        disabled={statusMutation.isPending}
      >
        {statusMutation.isPending
          ? "Updating…"
          : organization.isActive
            ? "Deactivate organization"
            : "Activate organization"}
      </Button>
    </div>
  );
};
