"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { OrgUser, StaffPermissions } from "@/types/schoolFees";

const defaultPerms: StaffPermissions = {
  canCollectFees: false,
  canManageStudents: false,
  canViewReports: false,
  canManageBuses: false
};

const StaffPage = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [editUser, setEditUser] = useState<OrgUser | null>(null);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    staffPermissions: { ...defaultPerms }
  });

  const staffQuery = useQuery({
    queryKey: ["org-staff"],
    queryFn: async () =>
      (await api.get<{ data: OrgUser[] }>("/api/org/users/staff")).data.data
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editUser) {
        return api.put(`/api/org/users/${editUser._id}`, {
          staffPermissions: form.staffPermissions
        });
      }
      return api.post("/api/org/users", {
        name: form.name,
        email: form.email,
        password: form.password,
        role: "staff",
        staffPermissions: form.staffPermissions
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-staff"] });
      setOpen(false);
      setEditUser(null);
      showToast("success", "Staff saved");
    },
    onError: () => showToast("error", "Failed to save staff")
  });

  const permFields: Array<{ key: keyof StaffPermissions; label: string }> = [
    { key: "canCollectFees", label: "Collect Fees" },
    { key: "canManageStudents", label: "Manage Students" },
    { key: "canViewReports", label: "View Reports" },
    { key: "canManageBuses", label: "Manage Buses" }
  ];

  return (
    <PageWrapper title="Staff Management">
      <Card>
        <div className="mb-4 flex justify-between">
          <p className="text-sm text-slate-600">Manage staff accounts and permissions</p>
          <Button
            onClick={() => {
              setEditUser(null);
              setForm({ name: "", email: "", password: "", staffPermissions: { ...defaultPerms } });
              setOpen(true);
            }}
          >
            Add Staff
          </Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="p-2">Name</th>
              <th>Email</th>
              <th>Permissions</th>
              <th>Status</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {(staffQuery.data ?? []).map((user) => (
              <tr key={user._id} className="border-t border-slate-100">
                <td className="p-2 font-medium">{user.name}</td>
                <td>{user.email}</td>
                <td className="text-xs">
                  {permFields
                    .filter((p) => user.staffPermissions?.[p.key])
                    .map((p) => p.label)
                    .join(", ") || "—"}
                </td>
                <td>{user.isActive ? "Active" : "Inactive"}</td>
                <td>
                  <button
                    type="button"
                    className="text-amber-600 hover:underline"
                    onClick={() => {
                      setEditUser(user);
                      setForm({
                        name: user.name,
                        email: user.email,
                        password: "",
                        staffPermissions: user.staffPermissions ?? { ...defaultPerms }
                      });
                      setOpen(true);
                    }}
                  >
                    Edit
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal
        isOpen={open}
        title={editUser ? "Edit Staff Permissions" : "Add Staff"}
        onClose={() => setOpen(false)}
      >
        <div className="space-y-3">
          {!editUser && (
            <>
              <input
                placeholder="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full rounded border px-3 py-2"
              />
              <input
                placeholder="Email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                className="w-full rounded border px-3 py-2"
              />
              <input
                type="password"
                placeholder="Password"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                className="w-full rounded border px-3 py-2"
              />
            </>
          )}
          <div className="space-y-2">
            {permFields.map((p) => (
              <label key={p.key} className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.staffPermissions[p.key]}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      staffPermissions: {
                        ...f.staffPermissions,
                        [p.key]: e.target.checked
                      }
                    }))
                  }
                />
                {p.label}
              </label>
            ))}
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Save
          </Button>
        </div>
      </Modal>
    </PageWrapper>
  );
};

export default StaffPage;
