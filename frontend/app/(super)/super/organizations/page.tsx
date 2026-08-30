"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

import { ListPagination } from "@/components/shared/ListPagination";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { DeleteOrganizationModal } from "@/components/superadmin/DeleteOrganizationModal";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
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
    <PageWrapper title="Organizations">
      <Card>
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setOpen(true)}>Add Organization</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="p-2">School</th>
              <th>Code</th>
              <th>Plan</th>
              <th>Students</th>
              <th>Status</th>
              <th className="p-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {orgRows.map((org) => (
              <tr
                key={org._id}
                className="cursor-pointer border-t border-slate-100 transition-colors hover:bg-slate-50"
                onClick={() => router.push(`/super/organizations/${org._id}`)}
              >
                <td className="p-2 font-medium">{org.name}</td>
                <td>{org.code}</td>
                <td className="capitalize">{org.plan}</td>
                <td>{org.studentCount ?? 0}</td>
                <td>{org.isActive ? "Active" : "Inactive"}</td>
                <td className="p-2 text-right">
                  <Button
                    variant="danger"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteOrg(org);
                    }}
                  >
                    Delete
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {pagination && (
          <ListPagination pagination={pagination} noun="organizations" onPageChange={setPage} />
        )}
      </Card>

      <Modal isOpen={open} title="Add Organization" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {(["name", "address", "phone", "email"] as const).map((field) => (
            <input
              key={field}
              placeholder={field.charAt(0).toUpperCase() + field.slice(1)}
              value={form[field]}
              onChange={(e) => setForm((f) => ({ ...f, [field]: e.target.value }))}
              className="w-full rounded border px-3 py-2"
            />
          ))}
          <select
            value={form.plan}
            onChange={(e) =>
              setForm((f) => ({ ...f, plan: e.target.value as typeof form.plan }))
            }
            className="w-full rounded border px-3 py-2"
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
          <div className="space-y-3 text-sm">
            <p>
              <span className="text-slate-500">Email:</span> {creds.email}
            </p>
            <p className="flex items-center gap-2">
              <span className="text-slate-500">Temporary password:</span>
              <code className="rounded bg-gray-100 px-2 py-1 text-gray-800">{creds.temporaryPassword}</code>
              <button type="button" onClick={copyPassword} aria-label="Copy password">
                <Copy className="h-4 w-4" />
              </button>
            </p>
            <p className="text-xs text-amber-700">
              Share these credentials securely with the school admin.
            </p>
          </div>
        )}
      </Modal>
    </PageWrapper>
  );
};

export default OrganizationsPage;
