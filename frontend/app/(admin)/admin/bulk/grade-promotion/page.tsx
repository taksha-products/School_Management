"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";

import { BulkProgressStepper } from "@/components/shared/BulkProgressStepper";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import type { Student } from "@/types";

const gradeFlow = ["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"];

const defaultMap: Record<string, string> = {
  Nursery: "KG1",
  KG1: "KG2",
  KG2: "1",
  "1": "2",
  "2": "3",
  "3": "4",
  "4": "5",
  "5": "6",
  "6": "7",
  "7": "8",
  "8": "9",
  "9": "10",
  "10": "11",
  "11": "12",
  "12": "graduate"
};

type PreviewResponse = {
  byGrade: Array<{ from: string; to: string; count: number }>;
  graduating: number;
  totalAffected: number;
};

const GradePromotionPage = (): JSX.Element => {
  const { showToast } = useToast();
  const [step, setStep] = useState(1);
  const [academicYear, setAcademicYear] = useState("2026-27");
  const [promotionMap, setPromotionMap] = useState<Record<string, string>>(defaultMap);
  const [previewData, setPreviewData] = useState<PreviewResponse | null>(null);
  const [resultData, setResultData] = useState<{ promoted: number; graduated: number } | null>(null);

  const studentsQuery = useQuery({
    queryKey: ["bulk-promotion-students"],
    queryFn: async () =>
      (
        await api.get<{ data: Student[] }>("/api/students", {
          params: { status: "active", page: 1, limit: 100 }
        })
      ).data.data
  });

  const countsByGrade = useMemo(() => {
    const map = new Map<string, number>();
    for (const grade of gradeFlow) map.set(grade, 0);
    for (const student of studentsQuery.data ?? []) {
      map.set(student.grade, (map.get(student.grade) ?? 0) + 1);
    }
    return map;
  }, [studentsQuery.data]);

  const previewMutation = useMutation({
    mutationFn: async () =>
      api.post<{ data: PreviewResponse }>("/api/bulk/students/promote", {
        academicYear,
        promotionMap,
        preview: true
      }),
    onSuccess: (res) => {
      setPreviewData(res.data.data);
      setStep(2);
      showToast("success", "Promotion preview ready");
    },
    onError: () => showToast("error", "Failed to preview promotion")
  });

  const confirmMutation = useMutation({
    mutationFn: async () =>
      api.post<{ data: { promoted: number; graduated: number } }>("/api/bulk/students/promote", {
        academicYear,
        promotionMap,
        preview: false
      }),
    onSuccess: (res) => {
      setResultData(res.data.data);
      setStep(3);
      showToast("success", "Promotion completed");
    },
    onError: () => showToast("error", "Promotion failed")
  });

  return (
    <PageWrapper title="Grade Promotion">
      <BulkProgressStepper
        steps={["Configure Promotion", "Preview", "Result"]}
        currentStep={step}
      />

      {step === 1 && (
        <Card title="Configure Promotion">
          <label className="mb-4 block text-sm">
            <span className="mb-1 block text-slate-600">New Academic Year</span>
            <input
              value={academicYear}
              onChange={(e) => setAcademicYear(e.target.value)}
              className="rounded border px-3 py-2"
              placeholder="2026-27"
            />
          </label>

          {studentsQuery.isLoading ? (
            <TableSkeleton rows={8} />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="text-left text-slate-500">
                  <tr>
                    <th>From Grade</th>
                    <th>To Grade</th>
                    <th>Student Count</th>
                  </tr>
                </thead>
                <tbody>
                  {gradeFlow.map((from) => (
                    <tr key={from} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{from}</td>
                      <td>
                        {from === "12" ? (
                          <input value="graduate" readOnly className="form-input bg-gray-50" />
                        ) : (
                          <input
                            value={promotionMap[from] ?? ""}
                            onChange={(e) =>
                              setPromotionMap((prev) => ({ ...prev, [from]: e.target.value }))
                            }
                            className="rounded border px-2 py-1"
                          />
                        )}
                      </td>
                      <td>{countsByGrade.get(from) ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-4">
            <Button onClick={() => previewMutation.mutate()} disabled={previewMutation.isPending}>
              {previewMutation.isPending ? "Previewing..." : "Preview Promotion"}
            </Button>
          </div>
        </Card>
      )}

      {step === 2 && previewData && (
        <Card title="Promotion Preview">
          <p className="text-lg font-semibold text-slate-800">
            {previewData.totalAffected} students will be promoted, {previewData.graduating} will graduate
          </p>
          <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
            This action cannot be undone. Graduated students will be marked inactive.
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[520px] text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th>From</th>
                  <th>To</th>
                  <th>Count</th>
                </tr>
              </thead>
              <tbody>
                {previewData.byGrade.map((row) => (
                  <tr key={row.from} className="border-t border-slate-100">
                    <td className="py-2">{row.from}</td>
                    <td>{row.to}</td>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-5 flex gap-2">
            <Button variant="secondary" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => confirmMutation.mutate()} disabled={confirmMutation.isPending}>
              {confirmMutation.isPending ? "Promoting..." : "Confirm Promotion"}
            </Button>
          </div>
        </Card>
      )}

      {step === 3 && resultData && (
        <Card title="Promotion Complete">
          <p className="text-lg font-bold text-emerald-700">
            ✓ {resultData.promoted} students promoted to {academicYear}
          </p>
          <p className="mt-2 text-lg font-bold text-emerald-700">
            ✓ {resultData.graduated} students graduated and marked inactive
          </p>
          <p className="mt-3 text-sm text-slate-600">
            Next step: Assign fee structures for the new academic year.
          </p>
          <div className="mt-4 flex gap-2">
            <Link href="/admin/fees/structure">
              <Button>Go to Fee Structure Assignment</Button>
            </Link>
            <Button
              variant="secondary"
              onClick={() => {
                setStep(1);
                setPreviewData(null);
                setResultData(null);
              }}
            >
              Run Again
            </Button>
          </div>
        </Card>
      )}
    </PageWrapper>
  );
};

export default GradePromotionPage;
