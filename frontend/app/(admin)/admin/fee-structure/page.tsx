"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { ACADEMIC_YEAR, FEE_HEAD_PRESETS, GRADE_OPTIONS } from "@/lib/constants";
import { api } from "@/lib/api";
import type { FeeHead, FeeStructure } from "@/types/schoolFees";
import type { Student } from "@/types";

const emptyHead = (): FeeHead => ({
  name: "",
  amount: 0,
  frequency: "monthly",
  dueDay: 10,
  isOptional: false,
  category: "academic"
});

const FeeStructurePage = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useState(ACADEMIC_YEAR);
  const [grades, setGrades] = useState<string[]>([]);
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([emptyHead()]);
  const [assignIds, setAssignIds] = useState<string[]>([]);
  const [gradeFilter, setGradeFilter] = useState("");

  const structuresQuery = useQuery({
    queryKey: ["fee-structures"],
    queryFn: async () =>
      (await api.get<{ data: FeeStructure[] }>("/api/fee-structure")).data.data
  });

  const studentsQuery = useQuery({
    queryKey: ["students-assign", gradeFilter],
    queryFn: async () =>
      (
        await api.get<{ data: Student[] }>("/api/students", {
          params: {
            status: "active",
            page: 1,
            limit: 100,
            ...(gradeFilter ? { grade: gradeFilter } : {})
          }
        })
      ).data.data
  });

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        academicYear,
        applicableGrades: grades.includes("All") ? [] : grades,
        feeHeads
      };
      if (selectedId) {
        return api.put(`/api/fee-structure/${selectedId}`, payload);
      }
      return api.post("/api/fee-structure", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
      setShowForm(false);
      showToast("success", "Fee structure saved");
    },
    onError: () => showToast("error", "Failed to save fee structure")
  });

  const assignMutation = useMutation({
    mutationFn: async () => {
      if (!selectedId) return;
      return api.post(`/api/fee-structure/${selectedId}/assign`, {
        studentIds: assignIds,
        academicYear
      });
    },
    onSuccess: () => {
      showToast("success", "Fee structure assigned to students");
      setAssignIds([]);
    },
    onError: () => showToast("error", "Assignment failed")
  });

  const loadStructure = (s: FeeStructure) => {
    setSelectedId(s._id);
    setName(s.name);
    setAcademicYear(s.academicYear);
    setGrades(s.applicableGrades.length ? s.applicableGrades : ["All"]);
    setFeeHeads(s.feeHeads);
    setShowForm(true);
  };

  const addPresetHeads = () => {
    setFeeHeads(
      FEE_HEAD_PRESETS.map((p) => ({
        name: p.name,
        amount: p.name === "Tuition Fee" ? 5000 : 1500,
        frequency: p.frequency,
        dueDay: 10,
        isOptional: false,
        category: p.category
      }))
    );
  };

  return (
    <PageWrapper title="Fee Structure">
      <div className="grid gap-4 lg:grid-cols-[320px_1fr]">
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold">Structures</h3>
            <Button
              className="px-3 py-1.5 text-xs"
              onClick={() => {
                setSelectedId(null);
                setName("");
                setAcademicYear(ACADEMIC_YEAR);
                setGrades([]);
                setFeeHeads([emptyHead()]);
                setShowForm(true);
              }}
            >
              Create
            </Button>
          </div>
          <ul className="space-y-2 text-sm">
            {(structuresQuery.data ?? []).map((s) => (
              <li
                key={s._id}
                className={`cursor-pointer rounded-lg border p-3 ${
                  selectedId === s._id ? "border-primary bg-primary-50" : "border-gray-200"
                }`}
                onClick={() => {
                  setSelectedId(s._id);
                  loadStructure(s);
                }}
              >
                <p className="font-medium">{s.name}</p>
                <p className="text-xs text-slate-500">
                  {s.academicYear} · {s.feeHeads.length} heads ·{" "}
                  {s.applicableGrades.length ? `Grades ${s.applicableGrades.join(",")}` : "All grades"}
                </p>
                <p className="text-xs">{s.isActive ? "Active" : "Inactive"}</p>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h3 className="mb-3 font-semibold">
            {selectedId ? "Edit Fee Structure" : "Create Fee Structure"}
          </h3>
          <div className="space-y-3">
            <input
              placeholder="Structure name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            />
            <input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="w-full rounded border px-3 py-2 text-sm"
            />
            <div>
              <p className="mb-1 text-sm text-slate-600">Applicable grades</p>
              <div className="flex flex-wrap gap-2">
                {GRADE_OPTIONS.map((g) => (
                  <label key={g} className="flex items-center gap-1 text-sm">
                    <input
                      type="checkbox"
                      checked={grades.includes(g)}
                      onChange={(e) => {
                        setGrades((prev) =>
                          e.target.checked ? [...prev, g] : prev.filter((x) => x !== g)
                        );
                      }}
                    />
                    {g}
                  </label>
                ))}
              </div>
            </div>
            <div className="flex gap-2">
              <Button className="px-3 py-1.5 text-xs" variant="secondary" onClick={addPresetHeads}>
                Load common heads
              </Button>
              <Button
                className="px-3 py-1.5 text-xs"
                variant="secondary"
                onClick={() => setFeeHeads((h) => [...h, emptyHead()])}
              >
                <Plus className="h-4 w-4" /> Add row
              </Button>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-[700px] w-full text-xs">
                <thead>
                  <tr className="text-left text-slate-500">
                    <th>Name</th>
                    <th>Amount</th>
                    <th>Frequency</th>
                    <th>Due day</th>
                    <th>Category</th>
                    <th>Opt</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {feeHeads.map((head, idx) => (
                    <tr key={idx} className="border-t">
                      <td className="p-1">
                        <input
                          value={head.name}
                          onChange={(e) => {
                            const next = [...feeHeads];
                            next[idx] = { ...next[idx], name: e.target.value };
                            setFeeHeads(next);
                          }}
                          className="w-full rounded border px-1 py-1"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="number"
                          value={head.amount}
                          onChange={(e) => {
                            const next = [...feeHeads];
                            next[idx] = { ...next[idx], amount: Number(e.target.value) };
                            setFeeHeads(next);
                          }}
                          className="w-20 rounded border px-1 py-1"
                        />
                      </td>
                      <td className="p-1">
                        <select
                          value={head.frequency}
                          onChange={(e) => {
                            const next = [...feeHeads];
                            next[idx] = {
                              ...next[idx],
                              frequency: e.target.value as FeeHead["frequency"]
                            };
                            setFeeHeads(next);
                          }}
                          className="rounded border px-1 py-1"
                        >
                          <option value="monthly">monthly</option>
                          <option value="quarterly">quarterly</option>
                          <option value="annual">annual</option>
                          <option value="oneTime">oneTime</option>
                        </select>
                      </td>
                      <td className="p-1">
                        <input
                          type="number"
                          value={head.dueDay}
                          onChange={(e) => {
                            const next = [...feeHeads];
                            next[idx] = { ...next[idx], dueDay: Number(e.target.value) };
                            setFeeHeads(next);
                          }}
                          className="w-14 rounded border px-1 py-1"
                        />
                      </td>
                      <td className="p-1">
                        <select
                          value={head.category}
                          onChange={(e) => {
                            const next = [...feeHeads];
                            next[idx] = {
                              ...next[idx],
                              category: e.target.value as FeeHead["category"]
                            };
                            setFeeHeads(next);
                          }}
                          className="rounded border px-1 py-1"
                        >
                          <option value="academic">academic</option>
                          <option value="facility">facility</option>
                          <option value="exam">exam</option>
                          <option value="other">other</option>
                        </select>
                      </td>
                      <td className="p-1 text-center">
                        <input
                          type="checkbox"
                          checked={head.isOptional}
                          onChange={(e) => {
                            const next = [...feeHeads];
                            next[idx] = { ...next[idx], isOptional: e.target.checked };
                            setFeeHeads(next);
                          }}
                        />
                      </td>
                      <td className="p-1">
                        <button
                          type="button"
                          onClick={() => setFeeHeads((h) => h.filter((_, i) => i !== idx))}
                        >
                          <Trash2 className="h-4 w-4 text-rose-500" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              Save Structure
            </Button>
          </div>

          {selectedId && (
            <div className="mt-8 border-t pt-6">
              <h3 className="mb-2 font-semibold">Assign to Students</h3>
              <select
                value={gradeFilter}
                onChange={(e) => setGradeFilter(e.target.value)}
                className="mb-2 rounded border px-3 py-2 text-sm"
              >
                <option value="">All grades</option>
                {GRADE_OPTIONS.filter((g) => g !== "All").map((g) => (
                  <option key={g} value={g}>
                    Grade {g}
                  </option>
                ))}
              </select>
              <div className="mb-3 max-h-48 overflow-auto rounded border p-2 text-sm">
                {(studentsQuery.data ?? []).map((s) => (
                  <label key={s._id} className="flex items-center gap-2 py-1">
                    <input
                      type="checkbox"
                      checked={assignIds.includes(s._id)}
                      onChange={(e) =>
                        setAssignIds((prev) =>
                          e.target.checked
                            ? [...prev, s._id]
                            : prev.filter((id) => id !== s._id)
                        )
                      }
                    />
                    {s.name} (Grade {s.grade})
                  </label>
                ))}
              </div>
              <Button
                onClick={() => assignMutation.mutate()}
                disabled={!assignIds.length || assignMutation.isPending}
              >
                Assign to {assignIds.length} students
              </Button>
            </div>
          )}
        </Card>
      </div>

      <Modal isOpen={showForm && false} title="Fee Structure" onClose={() => setShowForm(false)}>
        <p />
      </Modal>
    </PageWrapper>
  );
};

export default FeeStructurePage;
