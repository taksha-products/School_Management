"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { OrgUser } from "@/types/schoolFees";
import type { Student } from "@/types";

const ParentsPage = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "",
    email: "",
    password: "",
    parentStudentIds: [] as string[]
  });

  const parentsQuery = useQuery({
    queryKey: ["org-parents"],
    queryFn: async () =>
      (await api.get<{ data: OrgUser[] }>("/api/org/users/parents")).data.data
  });

  const studentsQuery = useQuery({
    queryKey: ["students-parent-link"],
    queryFn: async () =>
      (
        await api.get<{ data: Student[] }>("/api/students", {
          params: { status: "active", page: 1, limit: 100 }
        })
      )
        .data.data
  });

  const saveMutation = useMutation({
    mutationFn: async () =>
      api.post("/api/org/users", {
        ...form,
        role: "parent"
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["org-parents"] });
      setOpen(false);
      showToast("success", "Parent account created");
    },
    onError: () => showToast("error", "Failed to create parent")
  });

  return (
    <PageWrapper title="Parent Accounts">
      <Card>
        <div className="mb-4 flex justify-between">
          <p className="text-sm text-slate-600">Parent logins linked to their children</p>
          <Button onClick={() => setOpen(true)}>Add Parent</Button>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="p-2">Name</th>
              <th>Email</th>
              <th>Linked Students</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {(parentsQuery.data ?? []).map((parent) => (
              <tr key={parent._id} className="border-t border-slate-100">
                <td className="p-2 font-medium">{parent.name}</td>
                <td>{parent.email}</td>
                <td className="text-xs">
                  {Array.isArray(parent.students)
                    ? parent.students.map((s) => (typeof s === "object" ? s.name : s)).join(", ")
                    : "—"}
                </td>
                <td>{parent.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Modal isOpen={open} title="Add Parent" onClose={() => setOpen(false)}>
        <div className="space-y-3">
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
          <div className="max-h-40 overflow-auto rounded border p-2 text-sm">
            <p className="mb-2 font-medium">Link students</p>
            {(studentsQuery.data ?? []).map((s) => (
              <label key={s._id} className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  checked={form.parentStudentIds.includes(s._id)}
                  onChange={(e) =>
                    setForm((f) => ({
                      ...f,
                      parentStudentIds: e.target.checked
                        ? [...f.parentStudentIds, s._id]
                        : f.parentStudentIds.filter((id) => id !== s._id)
                    }))
                  }
                />
                {s.name} (Grade {s.grade})
              </label>
            ))}
          </div>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
            Create Parent
          </Button>
        </div>
      </Modal>
    </PageWrapper>
  );
};

export default ParentsPage;
