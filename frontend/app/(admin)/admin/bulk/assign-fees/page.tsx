"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { BulkProgressStepper } from "@/components/shared/BulkProgressStepper";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { Student } from "@/types";
import type {
  AssignFeeStructurePayload,
  AssignFeeStructurePreview,
  AssignFeeStructureResult,
  FeeStructure
} from "@/types/schoolFees";

const STEPS = ["Select fee structure", "Select students", "Preview & confirm"];

type TargetMode = "grades" | "students";

const AssignFeesPage = (): JSX.Element => {
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [feeStructureId, setFeeStructureId] = useState("");
  const [academicYear, setAcademicYear] = useState("");
  const [targetMode, setTargetMode] = useState<TargetMode>("grades");
  const [selectedGrades, setSelectedGrades] = useState<string[]>([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [preview, setPreview] = useState<AssignFeeStructurePreview | null>(null);
  const [assignResult, setAssignResult] = useState<AssignFeeStructureResult | null>(null);

  const structuresQuery = useQuery({
    queryKey: ["fee-structures-assign"],
    queryFn: async () =>
      (await api.get<{ data: FeeStructure[] }>("/api/fee-structure")).data.data.filter(
        (structure) => structure.isActive
      )
  });

  const gradesQuery = useQuery({
    queryKey: ["student-grades-assign"],
    queryFn: async () => (await api.get<{ data: string[] }>("/api/students/grades")).data.data
  });

  const studentsQuery = useQuery({
    queryKey: ["assign-fees-students", studentSearch],
    queryFn: async () =>
      (
        await api.get<{ data: Student[] }>("/api/students", {
          params: {
            status: "active",
            search: studentSearch || undefined,
            page: 1,
            limit: 100
          }
        })
      ).data.data,
    enabled: targetMode === "students"
  });

  const selectedStructure = useMemo(
    () => (structuresQuery.data ?? []).find((structure) => structure._id === feeStructureId),
    [structuresQuery.data, feeStructureId]
  );

  useEffect(() => {
    if (!selectedStructure) {
      return;
    }
    setAcademicYear(selectedStructure.academicYear);
    if (targetMode === "grades") {
      setSelectedGrades(selectedStructure.applicableGrades);
    }
  }, [selectedStructure, targetMode]);

  const buildPayload = (): AssignFeeStructurePayload | null => {
    if (!feeStructureId || !academicYear) {
      return null;
    }

    if (targetMode === "students") {
      if (selectedStudentIds.length === 0) {
        return null;
      }
      return {
        feeStructureId,
        academicYear,
        studentIds: selectedStudentIds
      };
    }

    if (selectedGrades.length === 0) {
      return null;
    }

    return {
      feeStructureId,
      academicYear,
      grades: selectedGrades
    };
  };

  const previewMutation = useMutation({
    mutationFn: async (payload: AssignFeeStructurePayload) =>
      (await api.post<{ data: AssignFeeStructurePreview }>("/api/school-fees/assign/preview", payload))
        .data.data,
    onSuccess: (data) => {
      setPreview(data);
      setStep(3);
    },
    onError: () => showToast("error", "Failed to preview fee assignment")
  });

  const assignMutation = useMutation({
    mutationFn: async (payload: AssignFeeStructurePayload) =>
      (await api.post<{ data: AssignFeeStructureResult }>("/api/school-fees/assign", payload)).data
        .data,
    onSuccess: (data) => {
      setAssignResult(data);
      showToast("success", `Fees assigned to ${data.assigned} students. Go to Collect Fees →`);
    },
    onError: () => showToast("error", "Failed to assign fees")
  });

  const toggleGrade = (grade: string): void => {
    setSelectedGrades((prev) =>
      prev.includes(grade) ? prev.filter((item) => item !== grade) : [...prev, grade]
    );
  };

  const toggleStudent = (studentId: string): void => {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId) ? prev.filter((id) => id !== studentId) : [...prev, studentId]
    );
  };

  const handlePreview = (): void => {
    const payload = buildPayload();
    if (!payload) {
      showToast("error", "Select a fee structure and at least one grade or student");
      return;
    }
    previewMutation.mutate(payload);
  };

  const handleAssign = (): void => {
    const payload = buildPayload();
    if (!payload) {
      return;
    }
    assignMutation.mutate(payload);
  };

  const gradeOptions = gradesQuery.data ?? [];

  return (
    <PageWrapper title="Assign Fee Structure">
      <p className="mb-4 text-sm text-slate-600">
        Links students to a fee structure and creates pending fee ledger entries so they appear in
        Collect Fees.
      </p>

      <BulkProgressStepper steps={STEPS} currentStep={step} />

      {step === 1 && (
        <Card title="Step 1 — Select fee structure">
          {structuresQuery.isLoading ? (
            <TableSkeleton rows={4} />
          ) : (
            <div className="space-y-4">
              <select
                value={feeStructureId}
                onChange={(e) => setFeeStructureId(e.target.value)}
                className="w-full rounded border border-slate-200 px-3 py-2"
              >
                <option value="">Choose a fee structure</option>
                {(structuresQuery.data ?? []).map((structure) => (
                  <option key={structure._id} value={structure._id}>
                    {structure.name} ({structure.academicYear})
                  </option>
                ))}
              </select>

              {selectedStructure && (
                <div className="rounded-lg border border-slate-100 bg-slate-50 px-4 py-3 text-sm">
                  <p>
                    <span className="text-slate-500">Academic year:</span>{" "}
                    <strong>{selectedStructure.academicYear}</strong>
                  </p>
                  <p className="mt-1">
                    <span className="text-slate-500">Grades covered:</span>{" "}
                    {selectedStructure.applicableGrades.join(", ") || "—"}
                  </p>
                  <p className="mt-1">
                    <span className="text-slate-500">Fee heads:</span>{" "}
                    {selectedStructure.feeHeads.length}
                  </p>
                </div>
              )}

              <div>
                <label className="mb-1 block text-sm font-medium text-slate-700">
                  Academic year
                </label>
                <input
                  value={academicYear}
                  onChange={(e) => setAcademicYear(e.target.value)}
                  className="w-full rounded border border-slate-200 px-3 py-2"
                  placeholder="2025-26"
                />
              </div>

              <Button
                onClick={() => setStep(2)}
                disabled={!feeStructureId || !academicYear}
              >
                Continue
              </Button>
            </div>
          )}
        </Card>
      )}

      {step === 2 && (
        <Card title="Step 2 — Select target students">
          <div className="mb-4 flex flex-wrap gap-4 text-sm">
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={targetMode === "grades"}
                onChange={() => setTargetMode("grades")}
              />
              By grade
            </label>
            <label className="inline-flex items-center gap-2">
              <input
                type="radio"
                checked={targetMode === "students"}
                onChange={() => setTargetMode("students")}
              />
              Specific students
            </label>
          </div>

          {targetMode === "grades" ? (
            <div className="space-y-3">
              <p className="text-sm text-slate-600">
                Select grades to assign fees. Active students in these grades will be included.
              </p>
              <div className="flex flex-wrap gap-2">
                {gradeOptions.map((grade) => (
                  <label
                    key={grade}
                    className="inline-flex items-center gap-2 rounded border border-slate-200 px-3 py-1.5 text-sm"
                  >
                    <input
                      type="checkbox"
                      checked={selectedGrades.includes(grade)}
                      onChange={() => toggleGrade(grade)}
                    />
                    {grade}
                  </label>
                ))}
              </div>
              <label className="inline-flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={selectedGrades.includes("all")}
                  onChange={() => toggleGrade("all")}
                />
                All grades
              </label>
            </div>
          ) : (
            <div className="space-y-3">
              <input
                value={studentSearch}
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Search students by name"
                className="w-full rounded border border-slate-200 px-3 py-2"
              />
              {studentsQuery.isLoading ? (
                <TableSkeleton rows={6} />
              ) : (
                <div className="max-h-80 space-y-1 overflow-y-auto rounded border border-slate-100 p-2">
                  {(studentsQuery.data ?? []).map((student) => (
                    <label
                      key={student._id}
                      className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selectedStudentIds.includes(student._id)}
                        onChange={() => toggleStudent(student._id)}
                      />
                      <span>
                        {student.name} — Grade {student.grade}
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <p className="text-sm text-slate-600">{selectedStudentIds.length} students selected</p>
            </div>
          )}

          <div className="mt-4 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={handlePreview} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "Loading preview…" : "Preview assignment"}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && preview && (
        <Card title="Step 3 — Preview & confirm">
          <div className="space-y-2 text-sm text-slate-700">
            <p>
              <strong>{preview.toAssign}</strong> student{preview.toAssign === 1 ? "" : "s"} will be
              assigned fees
            </p>
            <p>
              <strong>{preview.skipped}</strong> student{preview.skipped === 1 ? "" : "s"} already
              have fees assigned and will be skipped
            </p>
            <p className="text-slate-500">Total matched: {preview.total}</p>
          </div>

          {selectedStructure && (
            <p className="mt-3 text-sm text-slate-600">
              Structure: <strong>{selectedStructure.name}</strong> · Academic year:{" "}
              <strong>{academicYear}</strong>
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2">
            <Button variant="secondary" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button
              onClick={handleAssign}
              disabled={assignMutation.isPending || preview.toAssign === 0}
            >
              {assignMutation.isPending ? "Assigning…" : "Assign Fees"}
            </Button>
            {assignResult && assignResult.assigned > 0 && (
              <Link href="/admin/school-fees" className="inline-flex items-center">
                <Button variant="secondary">Go to Collect Fees</Button>
              </Link>
            )}
          </div>
        </Card>
      )}
    </PageWrapper>
  );
};

export default AssignFeesPage;
