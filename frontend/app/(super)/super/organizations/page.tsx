"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState, type JSX } from "react";

import { SuperPageWrapper } from "@/components/layout/SuperPageWrapper";
import { DeleteOrganizationModal } from "@/components/superadmin/DeleteOrganizationModal";
import { SuperAdminListPagination } from "@/components/superadmin/SuperAdminListPagination";
import { SuperAdminSectionCard } from "@/components/superadmin/SuperAdminSectionCard";
import {
  SuperAdminStatusBadge,
  superAdminOutlineButtonClass,
  superAdminTableHeadClass
} from "@/components/superadmin/SuperAdminStatusBadge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { PaginatedResponse } from "@/types/pagination";
import type { Organization } from "@/types/schoolFees";

const OrganizationsPage = (): JSX.Element => {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [deleteOrg, setDeleteOrg] = useState<Organization | null>(null);
  const [creds, setCreds] = useState<{ email: string; temporaryPassword: string } | null>(null);
  const [page, setPage] = useState(1);
  const [form, setForm] = useState({
    name: "",
    address: "",
    phone: "",
    email: "",
    plan: "trial" as "trial" | "basic" | "pro"
  });

  const orgsQuery = useQuery({
    queryKey: ["super-orgs", { page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Organization>>("/api/superadmin/organizations", {
          params: { page, limit: 20 }
        })
      ).data,
    placeholderData: keepPreviousData
  });
  const orgRows = orgsQuery.data?.data ?? [];
  const pagination = orgsQuery.data?.pagination;

  const createMutation = useMutation({
    mutationFn: async () => api.post("/api/superadmin/organizations", form),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["super-orgs"] });
      setOpen(false);
      const cred = res.data?.data?.adminCredentials;
      if (cred) {
        setCreds(cred);
      }
      showToast("success", "Organization created");
    },
    onError: () => showToast("error", "Failed to create organization")
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => api.delete(`/api/superadmin/organizations/${id}`),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["super-orgs"] });
      void queryClient.invalidateQueries({ queryKey: ["super-dashboard"] });
      setDeleteOrg(null);
      showToast("success", "Organization deactivated");
    },
    onError: () => showToast("error", "Failed to delete organization")
  });

  const copyPassword = async () => {
    if (!creds?.temporaryPassword) return;
    await navigator.clipboard.writeText(creds.temporaryPassword);
    showToast("success", "Password copied");
  };

  return (
    <SuperPageWrapper title="Organizations" subtitle="Manage schools on the platform">
      <SuperAdminSectionCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">All organizations</h2>
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-hover"
          >
            Add organization
          </button>
        </div>

        {orgsQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[720px] overflow-hidden rounded-md border border-gray-200">
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[28%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[12%]" />
                    <col className="w-[16%]" />
                    <col className="w-[20%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#F9FAFB]">
                      <th className={superAdminTableHeadClass}>School</th>
                      <th className={superAdminTableHeadClass}>Code</th>
                      <th className={superAdminTableHeadClass}>Plan</th>
                      <th className={superAdminTableHeadClass}>Students</th>
                      <th className={superAdminTableHeadClass}>Status</th>
                      <th className={cn(superAdminTableHeadClass, "text-right")}>Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {orgRows.length === 0 ? (
                      <tr>
                        <td colSpan={6} className="px-4 py-10 text-center text-sm text-gray-500">
                          No organizations found.
                        </td>
                      </tr>
                    ) : (
                      orgRows.map((org, index) => (
                        <tr
                          key={org._id}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-gray-50/80",
                            index % 2 === 1 && "bg-[#FAFAFA]"
                          )}
                          onClick={() => router.push(`/super/organizations/${org._id}`)}
                        >
                          <td className="truncate px-4 py-3 font-semibold text-gray-900">{org.name}</td>
                          <td className="px-4 py-3 font-mono text-xs text-gray-600">{org.code}</td>
                          <td className="px-4 py-3 capitalize text-gray-600">{org.plan}</td>
                          <td className="px-4 py-3 tabular-nums text-gray-600">
                            {org.studentCount ?? 0}
                          </td>
                          <td className="px-4 py-3">
                            <SuperAdminStatusBadge active={org.isActive} />
                          </td>
                          <td className="px-4 py-3 text-right">
                            <button
                              type="button"
                              className={cn(
                                superAdminOutlineButtonClass,
                                "border-red-200 text-red-600 hover:bg-red-50"
                              )}
                              onClick={(e) => {
                                e.stopPropagation();
                                setDeleteOrg(org);
                              }}
                            >
                              Delete
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {pagination && (
              <SuperAdminListPagination
                pagination={pagination}
                noun="organizations"
                onPageChange={setPage}
              />
            )}
          </>
        )}
      </SuperAdminSectionCard>

      <Modal isOpen={open} title="Add Organization" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {(["name", "address", "phone", "email"] as const).map((field) => (
            <input
              key={field}
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
            />
          ))}
          <select
            value={form.plan}
            onChange={(e) =>
              setForm((f) => ({ ...f, plan: e.target.value as typeof form.plan }))
            }
            className="h-10 w-full rounded-md border border-gray-200 px-3 text-sm text-gray-900 outline-none focus:border-primary focus:ring-2 focus:ring-primary/15"
          >
            <option value="trial">Trial</option>
            <option value="basic">Basic</option>
            <option value="pro">Pro</option>
          </select>
          <Button onClick={() => createMutation.mutate()} disabled={createMutation.isPending}>
            Create
          </Button>
        </div>
      </Modal>

      <DeleteOrganizationModal
        organization={deleteOrg}
        isOpen={!!deleteOrg}
        deleting={deleteMutation.isPending}
        onClose={() => setDeleteOrg(null)}
        onConfirm={() => {
          if (deleteOrg) {
            deleteMutation.mutate(deleteOrg._id);
          }
        }}
      />

      <Modal isOpen={!!creds} title="Org Admin Credentials" onClose={() => setCreds(null)}>
        {creds && (
          <div className="space-y-3 text-sm text-gray-700">
            <p>
              <span className="font-medium text-gray-500">Email:</span> {creds.email}
            </p>
            <p className="flex flex-wrap items-center gap-2">
              <span className="font-medium text-gray-500">Temporary password:</span>
              <code className="rounded-md bg-gray-100 px-2 py-1 text-gray-800">
                {creds.temporaryPassword}
              </code>
              <button type="button" onClick={copyPassword} aria-label="Copy password">
                <Copy className="h-4 w-4 text-gray-600" />
              </button>
            </p>
            <p className="text-xs text-amber-700">
              Share these credentials securely with the school admin.
            </p>
          </div>
        )}
      </Modal>
    </SuperPageWrapper>
  );
};

export default OrganizationsPage;
