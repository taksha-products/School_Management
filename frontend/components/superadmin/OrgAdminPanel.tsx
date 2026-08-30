"use client";

import { useQuery } from "@tanstack/react-query";
import { useState, type JSX } from "react";

import { ResetAdminPasswordModal } from "@/components/superadmin/ResetAdminPasswordModal";
import { Button } from "@/components/ui/Button";
import type { OrgAdminResponse } from "@/types/superadmin";
import { api } from "@/lib/api";

interface OrgAdminPanelProps {
  organizationId: string;
  organizationName: string;
}

export const OrgAdminPanel = ({
  organizationId,
  organizationName
}: OrgAdminPanelProps): JSX.Element => {
  const [resetPasswordOpen, setResetPasswordOpen] = useState(false);

  const adminQuery = useQuery({
    queryKey: ["super-org-admin", organizationId],
    queryFn: async () =>
      (await api.get<OrgAdminResponse>(`/api/superadmin/organizations/${organizationId}/admin`))
        .data.data
  });

  const admin = adminQuery.data;

  return (
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
        </div>
      ) : null}

      <Button
        variant="secondary"
        onClick={() => setResetPasswordOpen(true)}
        disabled={adminQuery.isLoading || adminQuery.isError || !admin}
      >
        Reset Password
      </Button>

      <ResetAdminPasswordModal
        organizationId={organizationId}
        organizationName={organizationName}
        isOpen={resetPasswordOpen}
        onClose={() => setResetPasswordOpen(false)}
      />
    </div>
  );
};
