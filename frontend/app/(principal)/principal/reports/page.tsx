"use client";

import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";

import { useAcademicYearState } from "@/hooks/useAcademicYear";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { api } from "@/lib/api";
import type { MonthlyReport } from "@/types";

const PrincipalReportsPage = (): JSX.Element => {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7));
  const [academicYear, setAcademicYear] = useAcademicYearState();

  const monthlyQuery = useQuery({
    queryKey: ["principal-reports", month, academicYear],
    queryFn: async () =>
      (
        await api.get<{ data: MonthlyReport[] }>("/api/reports/monthly", {
          params: { month, academicYear }
        })
      ).data.data
  });

  return (
    <PageWrapper title="Reports">
      <Card>
        <div className="grid gap-2 md:grid-cols-2">
          <input
            type="month"
            value={month}
            onChange={(e) => setMonth(e.target.value)}
            className="rounded border px-3 py-2"
          />
          <input
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="rounded border px-3 py-2"
          />
        </div>
      </Card>
      <Card title="Per-Bus Monthly Table">
        {monthlyQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[860px] w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th>Bus</th>
                <th>Students</th>
                <th>Fees Due</th>
                <th>Collected</th>
                <th>Expenses</th>
                <th>Net Profit</th>
              </tr>
            </thead>
            <tbody>
              {(monthlyQuery.data ?? []).map((row) => (
                <tr key={row.busId} className="border-t">
                  <td className="py-2">{row.busNumber}</td>
                  <td>{row.studentCount}</td>
                  <td>Rs {row.totalFeesDue}</td>
                  <td>Rs {row.totalFeesCollected}</td>
                  <td>Rs {row.totalExpenses}</td>
                  <td className={row.netProfit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                    Rs {row.netProfit}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
      <Card title="Income vs Expenses">
        <div className="h-80">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={monthlyQuery.data ?? []}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="busNumber" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="totalFeesCollected" fill="#2563eb" />
              <Bar dataKey="totalExpenses" fill="#dc2626" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>
    </PageWrapper>
  );
};

export default PrincipalReportsPage;
