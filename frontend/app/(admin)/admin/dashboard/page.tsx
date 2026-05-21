"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { AlertTriangle, IndianRupee, TrendingUp, Users } from "lucide-react";
import {
  Area,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { z } from "zod";

import { KpiStatCard } from "@/components/dashboard/KpiStatCard";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import {
  CHART_LIGHT,
  CHART_PIE_COLORS,
  CHART_PRIMARY,
  chartAxisTick,
  chartGridProps,
  chartTooltipStyle
} from "@/lib/chartTheme";
import { colors } from "@/lib/colors";
import { cn, formatINR } from "@/lib/utils";
import type { DashboardSummary, Expense, FeePayment, MonthlyReport } from "@/types";

const ACADEMIC_YEAR = "2025-26";

function getCurrentMonthKey(): string {
  return new Date().toISOString().slice(0, 7);
}

function lastNMonths(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    out.push(d.toISOString().slice(0, 7));
  }
  return out;
}

const payModalSchema = z.object({
  amountPaid: z.coerce.number().min(0)
});
type PayModalForm = z.infer<typeof payModalSchema>;

const pctColor = (pct: number): string => {
  if (pct > 80) return "text-green-600";
  if (pct >= 50) return "text-primary";
  return "text-red-600";
};

const AdminDashboardPage = (): JSX.Element => {
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const currentMonth = useMemo(() => getCurrentMonthKey(), []);
  const monthLabel = new Date(`${currentMonth}-01`).toLocaleDateString("en-IN", {
    month: "long",
    year: "numeric"
  });

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", currentMonth, ACADEMIC_YEAR],
    queryFn: async () =>
      (await api.get<{ data: DashboardSummary }>("/api/reports/summary", {
        params: { month: currentMonth, academicYear: ACADEMIC_YEAR }
      })).data.data
  });

  const monthlyQuery = useQuery({
    queryKey: ["dashboard-monthly", currentMonth, ACADEMIC_YEAR],
    queryFn: async () =>
      (
        await api.get<{ data: MonthlyReport[] }>("/api/reports/monthly", {
          params: { month: currentMonth, academicYear: ACADEMIC_YEAR }
        })
      ).data.data
  });

  const feesQuery = useQuery({
    queryKey: ["dashboard-fees", currentMonth],
    queryFn: async () =>
      (
        await api.get<{ data: FeePayment[] }>("/api/fees", {
          params: { month: currentMonth, page: 1, limit: 100 }
        })
      ).data.data
  });

  const expensesQuery = useQuery({
    queryKey: ["dashboard-expenses", currentMonth, ACADEMIC_YEAR],
    queryFn: async () =>
      (
        await api.get<{ data: Expense[] }>("/api/expenses", {
          params: { month: currentMonth, academicYear: ACADEMIC_YEAR, page: 1, limit: 100 }
        })
      ).data.data
  });

  const trendMonths = useMemo(() => lastNMonths(6), []);

  const sixMonthTrendQuery = useQuery({
    queryKey: ["dashboard-6m-trend", trendMonths.join(","), ACADEMIC_YEAR],
    queryFn: async () => {
      const results = await Promise.all(
        trendMonths.map(async (m) => {
          const res = await api.get<{ data: MonthlyReport[] }>("/api/reports/monthly", {
            params: { month: m, academicYear: ACADEMIC_YEAR }
          });
          const rows = res.data.data;
          const collected = rows.reduce((s, r) => s + r.totalFeesCollected, 0);
          const expenses = rows.reduce((s, r) => s + r.totalExpenses, 0);
          return {
            monthKey: m,
            label: new Date(`${m}-01T12:00:00`).toLocaleDateString("en-IN", {
              month: "short"
            }),
            collected,
            expenses
          };
        })
      );
      return results;
    }
  });

  const totalFeesDue = useMemo(
    () => (monthlyQuery.data ?? []).reduce((s, r) => s + r.totalFeesDue, 0),
    [monthlyQuery.data]
  );

  const totalCollected = summaryQuery.data?.totalFeesCollected ?? 0;
  const collectionPct =
    totalFeesDue > 0 ? Math.min(100, Math.round((totalCollected / totalFeesDue) * 100)) : 0;

  const outstandingAmount = Math.max(0, totalFeesDue - totalCollected);

  const pendingStudents = useMemo(() => {
    return (monthlyQuery.data ?? []).reduce((acc, r) => acc + r.pendingCount, 0);
  }, [monthlyQuery.data]);

  const expenseByCategory = useMemo(() => {
    const map = { diesel: 0, maintenance: 0, other: 0 };
    for (const e of expensesQuery.data ?? []) {
      map[e.category] = (map[e.category] ?? 0) + e.amount;
    }
    return [
      { name: "Diesel", key: "diesel" as const, value: map.diesel },
      { name: "Maintenance", key: "maintenance" as const, value: map.maintenance },
      { name: "Other", key: "other" as const, value: map.other }
    ].filter((x) => x.value > 0);
  }, [expensesQuery.data]);

  const pieTotal = expenseByCategory.reduce((s, x) => s + x.value, 0);

  const unpaidFees = useMemo(() => {
    const list = (feesQuery.data ?? []).filter((p) =>
      ["pending", "overdue", "partial"].includes(p.status)
    );
    const rank = (s: FeePayment["status"]) =>
      s === "overdue" ? 0 : s === "partial" ? 1 : s === "pending" ? 2 : 3;
    return [...list].sort((a, b) => {
      const dr = rank(a.status) - rank(b.status);
      if (dr !== 0) return dr;
      return a.month < b.month ? 1 : -1;
    });
  }, [feesQuery.data]);

  const busPerformanceRows = useMemo(() => {
    return [...(monthlyQuery.data ?? [])]
      .map((r) => {
        const pct =
          r.totalFeesDue > 0
            ? Math.round((r.totalFeesCollected / r.totalFeesDue) * 100)
            : 0;
        return { ...r, collectedPct: pct };
      })
      .sort((a, b) => b.netProfit - a.netProfit);
  }, [monthlyQuery.data]);

  const [payModalPayment, setPayModalPayment] = useState<FeePayment | null>(null);
  const payForm = useForm<PayModalForm>({ resolver: zodResolver(payModalSchema) });

  const recordPayment = useMutation({
    mutationFn: async (payload: PayModalForm) => {
      if (!payModalPayment) return;
      const sid =
        typeof payModalPayment.studentId === "string"
          ? payModalPayment.studentId
          : payModalPayment.studentId._id;
      return api.post("/api/fees/record", {
        studentId: sid,
        month: currentMonth,
        academicYear: payModalPayment.academicYear,
        amountPaid: payload.amountPaid
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dashboard-fees"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-monthly"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard-6m-trend"] });
      setPayModalPayment(null);
      payForm.reset();
      showToast("success", "Payment recorded");
    },
    onError: () => showToast("error", "Could not record payment")
  });

  const loadingMain =
    summaryQuery.isLoading ||
    monthlyQuery.isLoading ||
    feesQuery.isLoading ||
    expensesQuery.isLoading;

  const totalSchoolStudents =
    summaryQuery.data?.totalSchoolStudents ?? summaryQuery.data?.totalStudents ?? 0;
  const onBusStudents = summaryQuery.data?.onBusStudents ?? 0;
  const netProfit = summaryQuery.data?.netProfit ?? 0;

  const studentInitials = (name: string): string =>
    name
      .split(" ")
      .map((p) => p[0])
      .join("")
      .slice(0, 2)
      .toUpperCase();

  return (
    <PageWrapper
      title="Dashboard"
      subtitle={`Financial snapshot for ${monthLabel} · Academic year ${ACADEMIC_YEAR}`}
    >
      {loadingMain ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-xl bg-gray-200" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <KpiStatCard
            label="Total students"
            icon={Users}
            value={totalSchoolStudents}
            sub={`${onBusStudents} on bus transport`}
          />

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-card">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary-50">
              <IndianRupee className="h-5 w-5 text-primary" />
            </div>
            <p className="mt-4 text-[13px] text-gray-500">Fees collected this month</p>
            <p className="mt-1 text-[28px] font-semibold tabular-nums text-gray-900">
              {formatINR(totalCollected)}
            </p>
            <p className="mt-1 text-[13px] text-gray-500">
              of {formatINR(totalFeesDue)} due · {collectionPct}% collected
            </p>
            <div className="mt-3 h-1 w-full overflow-hidden rounded-full bg-gray-100">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${collectionPct}%` }}
              />
            </div>
          </div>

          <KpiStatCard
            label="Outstanding dues"
            icon={AlertTriangle}
            value={
              <span
                className={cn(
                  outstandingAmount > 0 ? "text-red-600" : "text-green-600"
                )}
              >
                {outstandingAmount > 0 ? formatINR(outstandingAmount) : "All clear"}
              </span>
            }
            sub={`${pendingStudents} students pending`}
          />

          <KpiStatCard
            label="Net profit this month"
            icon={TrendingUp}
            value={
              <span
                className={cn(
                  netProfit > 0
                    ? "text-green-600"
                    : netProfit < 0
                      ? "text-red-600"
                      : "text-gray-500"
                )}
              >
                {formatINR(netProfit)}
              </span>
            }
            sub="Income minus expenses"
          />
        </div>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
        <Card title="Fee collection trend" className="lg:col-span-3" compact>
          {sixMonthTrendQuery.isLoading ? (
            <div className="h-72">
              <TableSkeleton rows={4} />
            </div>
          ) : (
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart
                  data={sixMonthTrendQuery.data ?? []}
                  margin={{ top: 12, right: 12, left: 8, bottom: 8 }}
                >
                  <CartesianGrid {...chartGridProps} />
                  <XAxis dataKey="label" tick={chartAxisTick} />
                  <YAxis
                    tick={chartAxisTick}
                    tickFormatter={(v) => `₹${Number(v) / 1000}k`}
                  />
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(value: number, name: string) => [
                      formatINR(Number(value)),
                      name
                    ]}
                  />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="collected"
                    name="Collected"
                    stroke={CHART_PRIMARY}
                    fill={CHART_LIGHT}
                    fillOpacity={0.6}
                    strokeWidth={2.5}
                  />
                  <Line
                    type="monotone"
                    dataKey="expenses"
                    name="Expenses"
                    stroke={colors.gray300}
                    strokeWidth={2}
                    dot={{ fill: colors.white, stroke: colors.gray300, strokeWidth: 2, r: 4 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          )}
        </Card>

        <Card title="Expense breakdown" className="lg:col-span-2" compact>
          {expensesQuery.isLoading ? (
            <div className="h-72">
              <TableSkeleton rows={3} />
            </div>
          ) : expenseByCategory.length === 0 ? (
            <p className="py-16 text-center text-sm text-gray-500">No expenses logged this month.</p>
          ) : (
            <div className="h-72 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={expenseByCategory}
                    cx="50%"
                    cy="45%"
                    innerRadius={55}
                    outerRadius={80}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    {expenseByCategory.map((_, i) => (
                      <Cell key={i} fill={CHART_PIE_COLORS[i % CHART_PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <text
                    x="50%"
                    y="45%"
                    textAnchor="middle"
                    dominantBaseline="middle"
                    className="fill-gray-900 text-sm font-semibold"
                  >
                    {formatINR(pieTotal)}
                  </text>
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(v: number) => formatINR(Number(v))}
                  />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 flex flex-wrap justify-center gap-4 text-xs text-gray-600">
                {expenseByCategory.map((x, i) => (
                  <li key={x.key} className="flex items-center gap-1.5">
                    <span
                      className="inline-block h-2.5 w-2.5 rounded-full"
                      style={{
                        backgroundColor: CHART_PIE_COLORS[i % CHART_PIE_COLORS.length]
                      }}
                    />
                    {x.name}: {formatINR(x.value)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card compact>
          <div className="mb-4 flex items-center gap-2">
            <h3 className="text-[15px] font-semibold text-gray-900">Pending payments</h3>
            <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600">
              {unpaidFees.length}
            </span>
          </div>
          <div className="max-h-80 space-y-2 overflow-y-auto">
            {feesQuery.isLoading ? (
              <TableSkeleton rows={5} />
            ) : unpaidFees.length === 0 ? (
              <div className="rounded-lg bg-green-50 px-4 py-6 text-center text-sm font-medium text-green-700">
                All students paid this month
              </div>
            ) : (
              unpaidFees.map((p) => {
                const student =
                  typeof p.studentId === "string"
                    ? null
                    : (p.studentId as { name: string; grade: string });
                const bus =
                  typeof p.busId === "string"
                    ? "-"
                    : (p.busId as { busNumber: string }).busNumber;
                const name = student?.name ?? "Student";
                return (
                  <div
                    key={p._id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2.5 transition hover:bg-primary-50"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-100 text-xs font-semibold text-primary">
                        {studentInitials(name)}
                      </span>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-medium text-gray-900">{name}</span>
                          {student?.grade && (
                            <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600">
                              {student.grade}
                            </span>
                          )}
                          <span className="rounded-full bg-primary-50 px-2 py-0.5 text-xs text-primary">
                            {bus}
                          </span>
                        </div>
                        <Badge status={p.status} />
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold tabular-nums text-gray-900">
                        {formatINR(p.amount)}
                      </span>
                      <Button
                        variant="primary"
                        className="text-xs"
                        onClick={() => {
                          setPayModalPayment(p);
                          payForm.reset({ amountPaid: p.amount });
                        }}
                      >
                        Collect
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </Card>

        <Card title="Bus performance" compact>
          {monthlyQuery.isLoading ? (
            <TableSkeleton rows={6} />
          ) : (
            <div className="overflow-x-auto">
              <table className="data-table w-full min-w-[520px]">
                <thead>
                  <tr>
                    <th>Bus</th>
                    <th>Collected</th>
                    <th>Due</th>
                    <th>Expenses</th>
                    <th>Profit</th>
                    <th>%</th>
                  </tr>
                </thead>
                <tbody>
                  {busPerformanceRows.map((row, idx) => (
                    <tr
                      key={row.busId}
                      className={cn(idx % 2 === 1 && "bg-gray-50")}
                    >
                      <td className="font-medium text-gray-900">{row.busNumber}</td>
                      <td className="tabular-nums">{formatINR(row.totalFeesCollected)}</td>
                      <td className="tabular-nums">{formatINR(row.totalFeesDue)}</td>
                      <td className="tabular-nums">{formatINR(row.totalExpenses)}</td>
                      <td
                        className={cn(
                          "font-medium tabular-nums",
                          row.netProfit > 0
                            ? "text-green-600"
                            : row.netProfit < 0
                              ? "text-red-600"
                              : "text-gray-400"
                        )}
                      >
                        {formatINR(row.netProfit)}
                      </td>
                      <td className={cn("font-semibold tabular-nums", pctColor(row.collectedPct))}>
                        {row.collectedPct}%
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      </div>

      <Modal
        isOpen={!!payModalPayment}
        onClose={() => setPayModalPayment(null)}
        title="Record payment"
      >
        <form
          className="grid gap-3"
          onSubmit={payForm.handleSubmit((v) => recordPayment.mutate(v))}
        >
          <p className="text-sm text-gray-600">Amount paid (cash) for {currentMonth}</p>
          <input
            type="number"
            className="form-input"
            {...payForm.register("amountPaid")}
          />
          <Button type="submit" disabled={recordPayment.isPending}>
            Submit
          </Button>
        </form>
      </Modal>

      <div className="flex justify-end">
        <Link href={`/admin/reports?month=${currentMonth}&academicYear=${ACADEMIC_YEAR}`}>
          <Button variant="secondary">Full reports →</Button>
        </Link>
      </div>
    </PageWrapper>
  );
};

export default AdminDashboardPage;
