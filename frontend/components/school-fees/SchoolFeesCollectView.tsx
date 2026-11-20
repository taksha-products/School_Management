"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { ListPagination } from "@/components/shared/ListPagination";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useAcademicYearState } from "@/hooks/useAcademicYear";
import { academicYearOptions } from "@/lib/academicYear";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { PaginatedResponse } from "@/types/pagination";
import type { OutstandingStudent } from "@/types/schoolFees";

interface SchoolFeesCollectViewProps {
  receiptBasePath: string;
  historyPath?: (studentId: string) => string;
}

export const SchoolFeesCollectView = ({
  receiptBasePath: _receiptBasePath,
  historyPath: _historyPath
}: SchoolFeesCollectViewProps): JSX.Element => {
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [academicYear, setAcademicYear] = useAcademicYearState();
  const [listPage, setListPage] = useState(1);

  useEffect(() => {
    setListPage(1);
  }, [search, academicYear]);

  const outstandingQuery = useQuery({
    queryKey: ["school-fees-outstanding-collect", { listPage, academicYear }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<OutstandingStudent>>("/api/school-fees/outstanding", {
          params: {
            academicYear,
            page: listPage,
            limit: 50
          }
        })
      ).data,
    placeholderData: keepPreviousData
  });

  const filteredRows = useMemo(() => {
    const rows = outstandingQuery.data?.data ?? [];
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.studentName.toLowerCase().includes(q) || row.grade.toLowerCase().includes(q)
    );
  }, [outstandingQuery.data, search]);

  const listPagination = outstandingQuery.data?.pagination;

  const goCollect = (studentId: string): void => {
    router.push(`/admin/fees/collect/${studentId}`);
  };

  return (
    <div className="space-y-4 -mt-1">
      <Card compact className="border-slate-100 bg-slate-50/40 shadow-none">
        <div className="flex flex-wrap gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by student name or grade..."
            className="min-w-[220px] flex-1 rounded border border-slate-200 px-3 py-2 text-sm"
          />
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="rounded border border-slate-200 px-3 py-2 text-sm"
          >
            {academicYearOptions(academicYear).map((year) => (
              <option key={year} value={year}>
                {year}
              </option>
            ))}
          </select>
        </div>
        <p className="mt-2 text-sm text-slate-600">
          {listPagination?.total ?? 0} students with outstanding school fees
          {search.trim() ? ` · showing ${filteredRows.length} matches on this page` : ""}
        </p>
      </Card>

      <Card compact className="border-slate-100 shadow-none">
        {outstandingQuery.isLoading ? (
          <TableSkeleton />
        ) : filteredRows.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-500">
            {search.trim() ? "No students match your search." : "No outstanding school fees."}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-[700px] w-full text-sm">
              <thead className="text-left text-slate-500">
                <tr>
                  <th className="p-2">Student</th>
                  <th>Grade</th>
                  <th>Balance</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr
                    key={row.studentId}
                    className="cursor-pointer border-t border-slate-100 hover:bg-primary-50"
                    onClick={() => goCollect(row.studentId)}
                  >
                    <td className="p-2 font-medium">{row.studentName}</td>
                    <td>{row.grade}</td>
                    <td className="font-semibold text-rose-600">{formatINR(row.balance)}</td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <Button
                        size="sm"
                        variant="secondary"
                        className="border-primary text-primary hover:bg-primary-50"
                        onClick={() => goCollect(row.studentId)}
                      >
                        Collect
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {listPagination && !search.trim() && (
          <ListPagination
            pagination={listPagination}
            noun="students"
            onPageChange={setListPage}
          />
        )}
      </Card>
    </div>
  );
};
