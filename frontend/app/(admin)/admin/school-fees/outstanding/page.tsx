"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useEffect, useState } from "react";

import { ListPagination } from "@/components/shared/ListPagination";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { ACADEMIC_YEAR, GRADE_OPTIONS } from "@/lib/constants";
import { api } from "@/lib/api";
import { downloadFromApi } from "@/lib/fileDownload";
import { formatINR } from "@/lib/utils";
import type { PaginatedResponse } from "@/types/pagination";
import type { OutstandingStudent } from "@/types/schoolFees";

const OutstandingPage = (): JSX.Element => {
  const { showToast } = useToast();
  const [grade, setGrade] = useState("");
  const [feeHeadName, setFeeHeadName] = useState("");
  const [academicYear, setAcademicYear] = useState(ACADEMIC_YEAR);
  const [page, setPage] = useState(1);
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    setPage(1);
  }, [grade, feeHeadName, academicYear]);

  const summaryQuery = useQuery({
    queryKey: ["school-fees-summary", academicYear],
    queryFn: async () =>
      (
        await api.get<{ data: { totalOutstanding: number } }>("/api/school-fees/summary", {
          params: { academicYear }
        })
      ).data.data
  });

  const query = useQuery({
    queryKey: ["school-fees-outstanding", { page, grade, feeHeadName, academicYear }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<OutstandingStudent>>("/api/school-fees/outstanding", {
          params: {
            academicYear,
            grade: grade || undefined,
            feeHeadName: feeHeadName || undefined,
            page,
            limit: 50
          }
        })
      ).data,
    placeholderData: keepPreviousData
  });

  const rows = query.data?.data ?? [];
  const pagination = query.data?.pagination;

  const handleExport = async (): Promise<void> => {
    try {
      setIsExporting(true);
      await downloadFromApi(
        "/api/bulk/export/school-fees-outstanding",
        `bustrack_school_fees_outstanding_${new Date().toISOString().slice(0, 10)}.xlsx`,
        {
          grade: grade || undefined,
          academicYear
        }
      );
      showToast("success", "Outstanding report downloaded");
    } catch {
      showToast("error", "Failed to export outstanding report");
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PageWrapper title="Outstanding School Fees">
      <Card className="mb-4">
        <p className="text-sm text-slate-600">
          Total outstanding:{" "}
          <span className="text-xl font-bold text-rose-600">
            {formatINR(summaryQuery.data?.totalOutstanding ?? 0)}
          </span>{" "}
          · {pagination?.total ?? 0} students with balance
        </p>
      </Card>
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            value={grade}
            onChange={(e) => setGrade(e.target.value === "All" ? "" : e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          >
            {GRADE_OPTIONS.map((g) => (
              <option key={g} value={g === "All" ? "" : g}>
                Grade {g}
              </option>
            ))}
          </select>
          <input
            placeholder="Filter by fee head"
            value={feeHeadName}
            onChange={(e) => setFeeHeadName(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          />
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
          >
            <option value={ACADEMIC_YEAR}>{ACADEMIC_YEAR}</option>
          </select>
          <Button variant="secondary" type="button" onClick={handleExport} disabled={isExporting}>
            {isExporting ? "Exporting..." : "Export to Excel"}
          </Button>
        </div>
        {query.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[800px] w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="p-2">Student</th>
                  <th>Grade</th>
                  <th>Total Due</th>
                  <th>Total Paid</th>
                  <th>Balance</th>
                  <th>Overdue</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.studentId} className="border-t border-slate-100">
                    <td className="p-2 font-medium">{row.studentName}</td>
                    <td>{row.grade}</td>
                    <td>{formatINR(row.totalDue)}</td>
                    <td>{formatINR(row.totalPaid)}</td>
                    <td className="font-semibold text-rose-600">{formatINR(row.balance)}</td>
                    <td>{formatINR(row.overdueAmount)}</td>
                    <td>
                      <Link
                        href={`/admin/fees?studentId=${row.studentId}`}
                        className="text-amber-600 hover:underline"
                      >
                        Collect
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {pagination && (
          <ListPagination
            pagination={pagination}
            noun="students"
            onPageChange={setPage}
          />
        )}
      </Card>
    </PageWrapper>
  );
};

export default OutstandingPage;
