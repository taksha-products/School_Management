"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Plus, Trash2 } from "lucide-react";
import { useState, type Dispatch, type SetStateAction } from "react";

import { useAcademicYear, useAcademicYearState } from "@/hooks/useAcademicYear";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { FEE_HEAD_PRESETS } from "@/lib/constants";
import { useOrgConfig } from "@/hooks/useOrgConfig";
import { api } from "@/lib/api";
import type { FeeHead, FeeStructure } from "@/types/schoolFees";

const emptyHead = (): FeeHead => ({
  name: "",
  amount: 0,
  frequency: "monthly",
  dueDay: 10,
  isOptional: false,
  category: "academic"
});

const FeeStructureForm = ({
  name,
  setName,
  academicYear,
  setAcademicYear,
  grades,
  setGrades,
  feeHeads,
  setFeeHeads,
  gradeFilterOptions
}: {
  name: string;
  setName: (v: string) => void;
  academicYear: string;
  setAcademicYear: (v: string) => void;
  grades: string[];
  setGrades: Dispatch<SetStateAction<string[]>>;
  feeHeads: FeeHead[];
  setFeeHeads: Dispatch<SetStateAction<FeeHead[]>>;
  gradeFilterOptions: string[];
}): JSX.Element => {
  const addPresetHeads = (): void => {
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
    <div className="max-h-[70vh] space-y-3 overflow-y-auto pr-1">
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
          {gradeFilterOptions.map((g) => (
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
    </div>
  );
};

const FeeStructurePage = (): JSX.Element => {
  const orgAcademicYear = useAcademicYear();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { gradeFilterOptions } = useOrgConfig();
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [academicYear, setAcademicYear] = useAcademicYearState();
  const [grades, setGrades] = useState<string[]>([]);
  const [feeHeads, setFeeHeads] = useState<FeeHead[]>([emptyHead()]);

  const structuresQuery = useQuery({
    queryKey: ["fee-structures"],
    queryFn: async () =>
      (await api.get<{ data: FeeStructure[] }>("/api/fee-structure")).data.data
  });

  const resetForm = (): void => {
    setSelectedId(null);
    setName("");
    setAcademicYear(orgAcademicYear);
    setGrades([]);
    setFeeHeads([emptyHead()]);
  };

  const openCreate = (): void => {
    resetForm();
    setModalOpen(true);
  };

  const openEdit = (structure: FeeStructure): void => {
    setSelectedId(structure._id);
    setName(structure.name);
    setAcademicYear(structure.academicYear);
    setGrades(structure.applicableGrades.length ? structure.applicableGrades : []);
    setFeeHeads(structure.feeHeads);
    setModalOpen(true);
  };

  const closeModal = (): void => {
    setModalOpen(false);
    resetForm();
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = {
        name,
        academicYear,
        applicableGrades: grades,
        feeHeads
      };
      if (selectedId) {
        return api.put(`/api/fee-structure/${selectedId}`, payload);
      }
      return api.post("/api/fee-structure", payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
      closeModal();
      showToast("success", "Fee structure saved");
    },
    onError: () => showToast("error", "Failed to save fee structure")
  });

  const structures = structuresQuery.data ?? [];

  return (
    <PageWrapper
      title="Fee Structure"
      action={
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/bulk/assign-fees">
            <Button variant="secondary">Assign to students</Button>
          </Link>
          <Button onClick={openCreate}>Create</Button>
        </div>
      }
    >
      {structuresQuery.isLoading ? (
        <p className="text-sm text-slate-500">Loading fee structures...</p>
      ) : structures.length === 0 ? (
        <Card>
          <p className="py-8 text-center text-sm text-slate-500">
            No fee structures yet. Create one to get started.
          </p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {structures.map((structure) => (
            <Card
              key={structure._id}
              className="cursor-pointer transition hover:border-primary hover:shadow-md"
              onClick={() => openEdit(structure)}
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-semibold text-slate-900">{structure.name}</h3>
                  <p className="mt-1 text-xs text-slate-500">
                    {structure.academicYear} · {structure.feeHeads.length} fee heads
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {structure.applicableGrades.length
                      ? `Grades ${structure.applicableGrades.join(", ")}`
                      : "All grades"}
                  </p>
                </div>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                    structure.isActive
                      ? "bg-emerald-100 text-emerald-700"
                      : "bg-gray-100 text-gray-600"
                  }`}
                >
                  {structure.isActive ? "Active" : "Inactive"}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        isOpen={modalOpen}
        title={selectedId ? "Edit Fee Structure" : "Create Fee Structure"}
        onClose={closeModal}
        size="xl"
        footer={
          <>
            <Button variant="secondary" onClick={closeModal}>
              Cancel
            </Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending ? "Saving..." : "Save Structure"}
            </Button>
          </>
        }
      >
        <FeeStructureForm
          name={name}
          setName={setName}
          academicYear={academicYear}
          setAcademicYear={setAcademicYear}
          grades={grades}
          setGrades={setGrades}
          feeHeads={feeHeads}
          setFeeHeads={setFeeHeads}
          gradeFilterOptions={gradeFilterOptions.filter((g) => g !== "All")}
        />
      </Modal>
    </PageWrapper>
  );
};

export default FeeStructurePage;
