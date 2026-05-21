"use client";

import { useQuery } from "@tanstack/react-query";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { api } from "@/lib/api";
import type { DashboardSummary, MonthlyReport } from "@/types";

const currentMonth = new Date().toISOString().slice(0, 7);

const PrincipalDashboardPage = (): JSX.Element => {
  const summaryQuery = useQuery({
    queryKey: ["principal-summary", currentMonth],
    queryFn: async () =>
      (
        await api.get<{ data: DashboardSummary }>("/api/reports/summary", {
          params: { month: currentMonth, academicYear: "2025-26" }
        })
      ).data.data
  });
  const monthlyQuery = useQuery({
    queryKey: ["principal-monthly", currentMonth],
    queryFn: async () =>
      (
        await api.get<{ data: MonthlyReport[] }>("/api/reports/monthly", {
          params: { month: currentMonth, academicYear: "2025-26" }
        })
      ).data.data
  });

  return (
    <PageWrapper title="Principal Dashboard">
      <div className="grid gap-4 md:grid-cols-4">
        <Card title="Total Students">{summaryQuery.data?.totalStudents ?? "-"}</Card>
        <Card title="Fees Collected">Rs {summaryQuery.data?.totalFeesCollected ?? "-"}</Card>
        <Card title="Total Expenses">Rs {summaryQuery.data?.totalExpenses ?? "-"}</Card>
        <Card title="Net Profit">Rs {summaryQuery.data?.netProfit ?? "-"}</Card>
      </div>
      <Card title="Per-Bus Snapshot">
        {monthlyQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
          <table className="min-w-[680px] w-full text-sm">
            <thead className="text-left text-slate-500">
              <tr>
                <th>Bus</th>
                <th>Collected</th>
                <th>Due</th>
                <th>Expenses</th>
                <th>Profit</th>
              </tr>
            </thead>
            <tbody>
              {(monthlyQuery.data ?? []).map((row) => (
                <tr key={row.busId} className="border-t">
                  <td className="py-2">{row.busNumber}</td>
                  <td>Rs {row.totalFeesCollected}</td>
                  <td>Rs {row.totalFeesDue}</td>
                  <td>Rs {row.totalExpenses}</td>
                  <td>Rs {row.netProfit}</td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        )}
      </Card>
    </PageWrapper>
  );
};

export default PrincipalDashboardPage;
