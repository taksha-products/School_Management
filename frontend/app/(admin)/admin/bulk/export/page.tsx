"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { downloadFromApi } from "@/lib/fileDownload";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";
import type { Bus } from "@/types";

type ExportKey = "students" | "fees" | "outstanding" | "expenses";

const BulkExportPage = (): JSX.Element => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState<Record<ExportKey, boolean>>({
    students: false,
    fees: false,
    outstanding: false,
    expenses: false
  });
  const [studentsFilters, setStudentsFilters] = useState({
    grade: "",
    busId: "",
    status: "active",
    academicYear: ACADEMIC_YEAR
  });
  const [feesFilters, setFeesFilters] = useState({
    month: new Date().toISOString().slice(0, 7),
    busId: "",
    status: "",
    academicYear: ACADEMIC_YEAR
  });
  const [outstandingFilters, setOutstandingFilters] = useState({
    grade: "",
    academicYear: ACADEMIC_YEAR
  });
  const [expensesFilters, setExpensesFilters] = useState({
    month: new Date().toISOString().slice(0, 7),
    busId: "",
    category: "",
    academicYear: ACADEMIC_YEAR
  });

  const busesQuery = useQuery({
    queryKey: ["bulk-export-buses"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  const grades = useMemo(
    () => ["Nursery", "KG1", "KG2", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"],
    []
  );

  const exportFile = async (
    key: ExportKey,
    url: string,
    filename: string,
    params: Record<string, string | undefined>
  ): Promise<void> => {
    try {
      setLoading((prev) => ({ ...prev, [key]: true }));
      await downloadFromApi(url, filename, params);
      showToast("success", "Export downloaded");
    } catch {
      showToast("error", "Export failed");
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <PageWrapper title="Bulk Export Hub">
      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Students">
          <div className="grid gap-2 md:grid-cols-2">
            <select
              value={studentsFilters.grade}
              onChange={(e) => setStudentsFilters((prev) => ({ ...prev, grade: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All grades</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  Grade {grade}
                </option>
              ))}
            </select>
            <select
              value={studentsFilters.busId}
              onChange={(e) => setStudentsFilters((prev) => ({ ...prev, busId: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All buses</option>
              {(busesQuery.data ?? []).map((bus) => (
                <option key={bus._id} value={bus._id}>
                  {bus.busNumber}
                </option>
              ))}
            </select>
            <select
              value={studentsFilters.status}
              onChange={(e) => setStudentsFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All status</option>
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
            <input
              value={studentsFilters.academicYear}
              onChange={(e) =>
                setStudentsFilters((prev) => ({ ...prev, academicYear: e.target.value }))
              }
              className="rounded border px-3 py-2 text-sm"
              placeholder="Academic year"
            />
          </div>
          <Button
            className="mt-4"
            onClick={() =>
              exportFile("students", "/api/bulk/export/students", `bustrack_students_${new Date().toISOString().slice(0, 10)}.xlsx`, studentsFilters)
            }
            disabled={loading.students}
          >
            {loading.students ? "Downloading..." : "Export to Excel"}
          </Button>
        </Card>

        <Card title="Fee Collection (Bus Fees)">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="month"
              value={feesFilters.month}
              onChange={(e) => setFeesFilters((prev) => ({ ...prev, month: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            />
            <select
              value={feesFilters.busId}
              onChange={(e) => setFeesFilters((prev) => ({ ...prev, busId: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All buses</option>
              {(busesQuery.data ?? []).map((bus) => (
                <option key={bus._id} value={bus._id}>
                  {bus.busNumber}
                </option>
              ))}
            </select>
            <select
              value={feesFilters.status}
              onChange={(e) => setFeesFilters((prev) => ({ ...prev, status: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All status</option>
              <option value="paid">Paid</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
              <option value="overdue">Overdue</option>
            </select>
            <input
              value={feesFilters.academicYear}
              onChange={(e) => setFeesFilters((prev) => ({ ...prev, academicYear: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
              placeholder="Academic year"
            />
          </div>
          <Button
            className="mt-4"
            onClick={() =>
              exportFile("fees", "/api/bulk/export/fees", `bustrack_fees_${new Date().toISOString().slice(0, 10)}.xlsx`, feesFilters)
            }
            disabled={loading.fees}
          >
            {loading.fees ? "Downloading..." : "Export to Excel"}
          </Button>
        </Card>

        <Card title="Outstanding School Fees">
          <div className="grid gap-2 md:grid-cols-2">
            <select
              value={outstandingFilters.grade}
              onChange={(e) => setOutstandingFilters((prev) => ({ ...prev, grade: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All grades</option>
              {grades.map((grade) => (
                <option key={grade} value={grade}>
                  Grade {grade}
                </option>
              ))}
            </select>
            <input
              value={outstandingFilters.academicYear}
              onChange={(e) =>
                setOutstandingFilters((prev) => ({ ...prev, academicYear: e.target.value }))
              }
              className="rounded border px-3 py-2 text-sm"
              placeholder="Academic year"
            />
          </div>
          <Button
            className="mt-4"
            onClick={() =>
              exportFile(
                "outstanding",
                "/api/bulk/export/school-fees-outstanding",
                `bustrack_school_fees_outstanding_${new Date().toISOString().slice(0, 10)}.xlsx`,
                outstandingFilters
              )
            }
            disabled={loading.outstanding}
          >
            {loading.outstanding ? "Downloading..." : "Export to Excel"}
          </Button>
        </Card>

        <Card title="Expenses">
          <div className="grid gap-2 md:grid-cols-2">
            <input
              type="month"
              value={expensesFilters.month}
              onChange={(e) => setExpensesFilters((prev) => ({ ...prev, month: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            />
            <select
              value={expensesFilters.busId}
              onChange={(e) => setExpensesFilters((prev) => ({ ...prev, busId: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All buses</option>
              {(busesQuery.data ?? []).map((bus) => (
                <option key={bus._id} value={bus._id}>
                  {bus.busNumber}
                </option>
              ))}
            </select>
            <select
              value={expensesFilters.category}
              onChange={(e) => setExpensesFilters((prev) => ({ ...prev, category: e.target.value }))}
              className="rounded border px-3 py-2 text-sm"
            >
              <option value="">All categories</option>
              <option value="diesel">diesel</option>
              <option value="maintenance">maintenance</option>
              <option value="other">other</option>
            </select>
            <input
              value={expensesFilters.academicYear}
              onChange={(e) =>
                setExpensesFilters((prev) => ({ ...prev, academicYear: e.target.value }))
              }
              className="rounded border px-3 py-2 text-sm"
              placeholder="Academic year"
            />
          </div>
          <Button
            className="mt-4"
            onClick={() =>
              exportFile(
                "expenses",
                "/api/bulk/export/expenses",
                `bustrack_expenses_${new Date().toISOString().slice(0, 10)}.xlsx`,
                expensesFilters
              )
            }
            disabled={loading.expenses}
          >
            {loading.expenses ? "Downloading..." : "Export to Excel"}
          </Button>
        </Card>
      </div>
    </PageWrapper>
  );
};

export default BulkExportPage;
