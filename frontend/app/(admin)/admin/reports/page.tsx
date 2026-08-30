"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Fragment, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { z } from "zod";

import { PageWrapper } from "@/components/layout/PageWrapper";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Modal } from "@/components/ui/Modal";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { downloadCsv } from "@/lib/fileDownload";
import { cn, formatINR } from "@/lib/utils";
import type { Bus, BusTrend, DashboardSummary, FeePayment, MonthlyReport } from "@/types";

const DEFAULT_ACADEMIC = "2025-26";

function defaultMonth(): string {
  return new Date().toISOString().slice(0, 7);
}

function academicYearMonths(ay: string): string[] {
  const [start] = ay.split("-");
  const y = Number(start);
  if (Number.isNaN(y)) return [];
  return [
    `${y}-04`,
    `${y}-05`,
    `${y}-06`,
    `${y}-07`,
    `${y}-08`,
    `${y}-09`,
    `${y}-10`,
    `${y}-11`,
    `${y}-12`,
    `${y + 1}-01`,
    `${y + 1}-02`,
    `${y + 1}-03`
  ];
}

type SortKey =
  | "busNumber"
  | "routeName"
  | "studentCount"
  | "transportStudentCount"
  | "totalFeesDue"
  | "totalFeesCollected"
  | "collectionPct"
  | "totalExpenses"
  | "netProfit";

const paySchema = z.object({ amountPaid: z.coerce.number().min(0) });
type PayForm = z.infer<typeof paySchema>;

const pct = (collected: number, due: number) =>
  due > 0 ? Math.round((collected / due) * 100) : 0;

const collectionBarColor = (p: number) => {
  if (p >= 80) return "#16a34a";
  if (p >= 50) return "#f59e0b";
  return "#dc2626";
};

const ReportsPageContent = (): JSX.Element => {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();

  const [month, setMonth] = useState(defaultMonth);
  const [academicYear, setAcademicYear] = useState(DEFAULT_ACADEMIC);
  const [busFilter, setBusFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("netProfit");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [expandedBusId, setExpandedBusId] = useState<string | null>(null);
  const [chartTab, setChartTab] = useState<"income" | "collection" | "trend">("income");
  const [payRow, setPayRow] = useState<FeePayment | null>(null);
  const payForm = useForm<PayForm>({ resolver: zodResolver(paySchema) });
  const [outstandingBusId, setOutstandingBusId] = useState("");
  const [isExporting, setIsExporting] = useState(false);

  useEffect(() => {
    const m = searchParams.get("month");
    const y = searchParams.get("academicYear");
    const b = searchParams.get("busId");
    if (m) setMonth(m);
    if (y) setAcademicYear(y);
    if (b) {
      setBusFilter(b);
      setOutstandingBusId(b);
    }
  }, [searchParams]);

  const syncUrl = useCallback(
    (next: { month?: string; academicYear?: string; busId?: string }) => {
      const params = new URLSearchParams(searchParams.toString());
      if (next.month !== undefined) params.set("month", next.month);
      if (next.academicYear !== undefined) params.set("academicYear", next.academicYear);
      if (next.busId !== undefined) {
        if (next.busId === "") params.delete("busId");
        else params.set("busId", next.busId);
      }
      router.replace(`/reports?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const busesQuery = useQuery({
    queryKey: ["reports-buses"],
    queryFn: async () => (await api.get<{ data: Bus[] }>("/api/buses")).data.data
  });

  const monthlyQuery = useQuery({
    queryKey: ["reports-monthly", month, academicYear],
    queryFn: async () =>
      (
        await api.get<{ data: MonthlyReport[] }>("/api/reports/monthly", {
          params: { month, academicYear }
        })
      ).data.data
  });

  const feesMonthQuery = useQuery({
    queryKey: ["reports-fees-month", month],
    queryFn: async () =>
      (
        await api.get<{ data: FeePayment[] }>("/api/fees", {
          params: { month, page: 1, limit: 100 }
        })
      ).data.data
  });

  const filteredMonthly = useMemo(() => {
    const rows = monthlyQuery.data ?? [];
    if (!busFilter) return rows;
    return rows.filter((r) => r.busId === busFilter);
  }, [monthlyQuery.data, busFilter]);

  const tableRows = useMemo(() => {
    const withPct = filteredMonthly.map((r) => ({
      ...r,
      collectionPct: pct(r.totalFeesCollected, r.totalFeesDue)
    }));
    const dir = sortDir === "asc" ? 1 : -1;
    return [...withPct].sort((a, b) => {
      const av = a[sortKey];
      const bv = b[sortKey];
      if (typeof av === "number" && typeof bv === "number") {
        return (av - bv) * dir;
      }
      return String(av).localeCompare(String(bv)) * dir;
    });
  }, [filteredMonthly, sortKey, sortDir]);

  const summaryStrip = useMemo(() => {
    const due = filteredMonthly.reduce((s, r) => s + r.totalFeesDue, 0);
    const collected = filteredMonthly.reduce((s, r) => s + r.totalFeesCollected, 0);
    const net = filteredMonthly.reduce((s, r) => s + r.netProfit, 0);
    const cp = due > 0 ? Math.round((collected / due) * 100) : 0;
    return { due, collected, net, collectionPct: cp };
  }, [filteredMonthly]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "netProfit" ? "desc" : "asc");
    }
  };

  const exportVisibleReport = (): void => {
    try {
      setIsExporting(true);
      const rows = tableRows.map((row) => [
        row.busNumber,
        row.routeName,
        row.studentCount,
        row.totalFeesDue,
        row.totalFeesCollected,
        row.collectionPct,
        row.totalExpenses,
        row.netProfit
      ]);
      downloadCsv(
        `taksha_report_${month}.csv`,
        [
          "Bus",
          "Route",
          "Students",
          "Fees Due",
          "Fees Collected",
          "Collection %",
          "Expenses",
          "Net Profit"
        ],
        rows
      );
      showToast("success", "Report exported");
    } catch {
      showToast("error", "Failed to export report");
    } finally {
      setIsExporting(false);
    }
  };

  const feesForExpanded = useMemo(() => {
    if (!expandedBusId || !feesMonthQuery.data) return [];
    return feesMonthQuery.data.filter((p) => {
      const bid = typeof p.busId === "string" ? p.busId : p.busId._id;
      return bid === expandedBusId;
    });
  }, [expandedBusId, feesMonthQuery.data]);

  const outstandingFees = useMemo(() => {
    let list = (feesMonthQuery.data ?? []).filter((p) =>
      ["pending", "overdue", "partial"].includes(p.status)
    );
    if (outstandingBusId) {
      list = list.filter((p) => {
        const bid = typeof p.busId === "string" ? p.busId : p.busId._id;
        return bid === outstandingBusId;
      });
    }
    const rank = (s: FeePayment["status"]) =>
      s === "overdue" ? 0 : s === "partial" ? 1 : s === "pending" ? 2 : 3;
    return [...list].sort((a, b) => rank(a.status) - rank(b.status));
  }, [feesMonthQuery.data, outstandingBusId]);

  const [statusFilter, setStatusFilter] = useState<"all" | "pending" | "overdue" | "partial">(
    "all"
  );

  const filteredOutstanding = useMemo(() => {
    if (statusFilter === "all") return outstandingFees;
    return outstandingFees.filter((p) => p.status === statusFilter);
  }, [outstandingFees, statusFilter]);

  const trendQuery = useQuery({
    queryKey: ["reports-trend-tab", busFilter || "all", academicYear],
    enabled: chartTab === "trend",
    queryFn: async () => {
      const months = academicYearMonths(academicYear);
      if (busFilter) {
        const res = await api.get<{ data: BusTrend[] }>(`/api/reports/bus/${busFilter}`, {
          params: { academicYear }
        });
        return res.data.data;
      }
      const summaries = await Promise.all(
        months.map(async (m) => {
          const res = await api.get<{ data: DashboardSummary }>("/api/reports/summary", {
            params: { month: m, academicYear }
          });
          const d = res.data.data;
          return {
            month: m,
            label: new Date(`${m}-01T12:00:00`).toLocaleDateString("en-IN", {
              month: "short",
              year: "2-digit"
            }),
            totalFeesCollected: d.totalFeesCollected,
            totalExpenses: d.totalExpenses,
            netProfit: d.netProfit
          };
        })
      );
      return summaries;
    }
  });

  const recordPay = useMutation({
    mutationFn: async (payload: PayForm) => {
      if (!payRow) return;
      const sid = typeof payRow.studentId === "string" ? payRow.studentId : payRow.studentId._id;
      return api.post("/api/fees/record", {
        studentId: sid,
        month,
        academicYear: payRow.academicYear,
        amountPaid: payload.amountPaid
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["reports-fees-month"] });
      queryClient.invalidateQueries({ queryKey: ["reports-monthly"] });
      queryClient.invalidateQueries({ queryKey: ["reports-trend-tab"] });
      setPayRow(null);
      payForm.reset();
      showToast("success", "Payment saved");
    },
    onError: () => showToast("error", "Failed to save")
  });

  const collectionChartData = filteredMonthly.map((r) => ({
    bus: r.busNumber,
    pct: pct(r.totalFeesCollected, r.totalFeesDue)
  }));

  return (
    <PageWrapper
      title="Financial reports"
      action={
        <Link href="/admin/bulk/export">
          <Button variant="secondary">Export</Button>
        </Link>
      }
    >
      {/* Controls */}
      <Card className="overflow-visible">
        <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            Month
            <input
              type="month"
              value={month}
              onChange={(e) => {
                const v = e.target.value;
                setMonth(v);
                syncUrl({ month: v });
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex min-w-[140px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            Academic year
            <input
              value={academicYear}
              onChange={(e) => {
                const v = e.target.value;
                setAcademicYear(v);
                syncUrl({ academicYear: v });
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </label>
          <label className="flex min-w-[160px] flex-1 flex-col gap-1 text-xs font-medium text-slate-600">
            Bus
            <select
              value={busFilter}
              onChange={(e) => {
                const v = e.target.value;
                setBusFilter(v);
                syncUrl({ busId: v });
              }}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            >
              <option value="">All buses</option>
              {(busesQuery.data ?? []).map((b) => (
                <option key={b._id} value={b._id}>
                  {b.busNumber}
                </option>
              ))}
            </select>
          </label>
          <Button
            variant="secondary"
            type="button"
            className="lg:ml-auto"
            onClick={exportVisibleReport}
            disabled={isExporting || tableRows.length === 0}
          >
            {isExporting ? "Exporting..." : "Export"}
          </Button>
        </div>
      </Card>

      {/* Summary strip */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          { label: "Total fees due", value: formatINR(summaryStrip.due) },
          { label: "Total collected", value: formatINR(summaryStrip.collected) },
          { label: "Collection %", value: `${summaryStrip.collectionPct}%` },
          {
            label: "Net profit",
            value: formatINR(summaryStrip.net),
            valClass:
              summaryStrip.net > 0
                ? "text-emerald-600"
                : summaryStrip.net < 0
                  ? "text-rose-600"
                  : "text-slate-400"
          }
        ].map((item) => (
          <div
            key={item.label}
            className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
          >
            <p className="text-xs font-semibold uppercase text-slate-500">{item.label}</p>
            <p className={cn("mt-1 text-xl font-bold tabular-nums text-slate-900", item.valClass)}>
              {item.value}
            </p>
          </div>
        ))}
      </div>

      {/* Per-bus table */}
      <Card title="Per-bus performance">
        {monthlyQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : tableRows.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">No data for these filters.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  {(
                    [
                      ["busNumber", "Bus"],
                      ["routeName", "Route"],
                      ["studentCount", "Students"],
                      ["transportStudentCount", "Transport Students"],
                      ["totalFeesDue", "Fees due"],
                      ["totalFeesCollected", "Collected"],
                      ["collectionPct", "Coll. %"],
                      ["totalExpenses", "Expenses"],
                      ["netProfit", "Net profit"]
                    ] as const
                  ).map(([key, label]) => (
                    <th key={key} className="cursor-pointer py-2 pr-2 hover:bg-slate-50">
                      <button
                        type="button"
                        className="font-semibold"
                        onClick={() => toggleSort(key as SortKey)}
                      >
                        {label}
                        {sortKey === key ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {tableRows.map((row) => (
                  <Fragment key={row.busId}>
                    <tr
                      className={cn(
                        "cursor-pointer border-t border-slate-100 hover:bg-slate-50",
                        expandedBusId === row.busId && "bg-slate-50"
                      )}
                      onClick={() =>
                        setExpandedBusId((id) => (id === row.busId ? null : row.busId))
                      }
                    >
                      <td className="py-2.5 font-medium">{row.busNumber}</td>
                      <td className="max-w-[140px] truncate text-slate-700">{row.routeName}</td>
                      <td className="tabular-nums">{row.studentCount}</td>
                      <td className="tabular-nums">
                        {row.transportStudentCount ?? row.studentCount}
                      </td>
                      <td className="tabular-nums">{formatINR(row.totalFeesDue)}</td>
                      <td className="tabular-nums">{formatINR(row.totalFeesCollected)}</td>
                      <td
                        className={cn(
                          "font-semibold tabular-nums",
                          row.collectionPct < 50 && "text-red-600",
                          row.collectionPct >= 50 &&
                            row.collectionPct <= 80 &&
                            "text-orange-600",
                          row.collectionPct > 80 && "text-emerald-600"
                        )}
                      >
                        {row.collectionPct}%
                      </td>
                      <td className="tabular-nums">{formatINR(row.totalExpenses)}</td>
                      <td
                        className={cn(
                          "font-semibold tabular-nums",
                          row.netProfit > 0 && "text-emerald-600",
                          row.netProfit < 0 && "text-rose-600",
                          row.netProfit === 0 && "text-slate-400"
                        )}
                      >
                        {formatINR(row.netProfit)}
                      </td>
                    </tr>
                    {expandedBusId === row.busId && (
                      <tr
                        className="border-t border-slate-100 bg-slate-50/90"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <td colSpan={8} className="px-4 py-3">
                          <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                            Student breakdown · {month}
                          </p>
                          {feesMonthQuery.isLoading ? (
                            <TableSkeleton rows={3} />
                          ) : feesForExpanded.length === 0 ? (
                            <p className="text-sm text-slate-500">No fee rows for this bus.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-slate-500">
                                  <th className="pb-1">Student</th>
                                  <th>Fee due</th>
                                  <th>Paid</th>
                                  <th>Status</th>
                                </tr>
                              </thead>
                              <tbody>
                                {feesForExpanded.map((p) => {
                                  const st =
                                    typeof p.studentId === "string"
                                      ? null
                                      : (p.studentId as { name: string });
                                  return (
                                    <tr key={p._id} className="border-t border-slate-200">
                                      <td className="py-1.5">{st?.name ?? "—"}</td>
                                      <td className="tabular-nums">{formatINR(p.amount)}</td>
                                      <td className="tabular-nums">{formatINR(p.amountPaid)}</td>
                                      <td>
                                        <Badge status={p.status}>{p.status}</Badge>
                                      </td>
                                    </tr>
                                  );
                                })}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Chart tabs */}
      <Card title="Charts">
        <div className="mb-4 flex flex-wrap gap-2 border-b border-slate-100 pb-3">
          {(
            [
              ["income", "Income vs expense"],
              ["collection", "Collection rate"],
              ["trend", "Monthly trend"]
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setChartTab(id)}
              className={cn(
                "rounded-lg px-4 py-2 text-sm font-semibold transition",
                chartTab === id
                  ? "bg-primary-50 text-primary"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-50 hover:text-primary"
              )}
            >
              {label}
            </button>
          ))}
        </div>

        {chartTab === "income" && (
          <div className="h-80 min-h-[280px] w-full min-w-0">
            {filteredMonthly.length === 0 ? (
              <p className="py-12 text-center text-slate-500">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={filteredMonthly}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="busNumber" />
                  <YAxis />
                  <Tooltip formatter={(v: number) => formatINR(Number(v))} />
                  <Legend />
                  <Bar dataKey="totalFeesCollected" fill="#16a34a" name="Collected" />
                  <Bar dataKey="totalExpenses" fill="#dc2626" name="Expenses" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {chartTab === "collection" && (
          <div className="h-80 min-h-[280px] w-full min-w-0">
            {collectionChartData.length === 0 ? (
              <p className="py-12 text-center text-slate-500">No data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart layout="vertical" data={collectionChartData} margin={{ left: 48 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="bus" width={72} tick={{ fontSize: 12 }} />
                  <Tooltip formatter={(v: number) => `${v}%`} />
                  <Bar dataKey="pct" name="Collection %" radius={[0, 4, 4, 0]}>
                    {collectionChartData.map((e, i) => (
                      <Cell key={i} fill={collectionBarColor(e.pct)} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        )}

        {chartTab === "trend" && (
          <div className="h-96 min-h-[320px] w-full min-w-0">
            {trendQuery.isLoading ? (
              <TableSkeleton rows={4} />
            ) : !trendQuery.data?.length ? (
              <p className="py-12 text-center text-slate-500">No trend data.</p>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={trendQuery.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey={busFilter ? "month" : "label"}
                    tick={{ fontSize: 10 }}
                    tickFormatter={
                      busFilter
                        ? (v: string) =>
                            new Date(`${v}-01T12:00:00`).toLocaleDateString("en-IN", {
                              month: "short"
                            })
                        : undefined
                    }
                  />
                  <YAxis
                    tickFormatter={(v) => {
                      const n = Number(v);
                      if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
                      if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(0)}k`;
                      return `₹${n}`;
                    }}
                  />
                  <Tooltip formatter={(v: number) => formatINR(Number(v))} />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="totalFeesCollected"
                    name="Collected"
                    stroke="#16a34a"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="totalExpenses"
                    name="Expenses"
                    stroke="#dc2626"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="netProfit"
                    name="Net profit"
                    stroke="#7c3aed"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        )}
      </Card>

      {/* Outstanding */}
      <Card
        title={`Students with outstanding fees — ${new Date(`${month}-01`).toLocaleDateString("en-IN", { month: "long", year: "numeric" })}`}
      >
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <span className="text-sm text-slate-600">
            Showing {filteredOutstanding.length} students with outstanding fees
          </span>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Bus
            <select
              value={outstandingBusId}
              onChange={(e) => setOutstandingBusId(e.target.value)}
              className="rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
            >
              <option value="">All buses</option>
              {(busesQuery.data ?? []).map((b) => (
                <option key={b._id} value={b._id}>
                  {b.busNumber}
                </option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Status
            <select
              value={statusFilter}
              onChange={(e) =>
                setStatusFilter(e.target.value as typeof statusFilter)
              }
              className="rounded border border-slate-200 px-2 py-1 text-sm text-slate-900"
            >
              <option value="all">All statuses</option>
              <option value="overdue">Overdue</option>
              <option value="partial">Partial</option>
              <option value="pending">Pending</option>
            </select>
          </label>
        </div>
        {feesMonthQuery.isLoading ? (
          <TableSkeleton rows={6} />
        ) : filteredOutstanding.length === 0 ? (
          <p className="py-8 text-center text-sm text-emerald-700">No outstanding fees for this view.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs uppercase text-slate-500">
                  <th className="py-2">Student</th>
                  <th>Grade</th>
                  <th>Bus</th>
                  <th>Fee due</th>
                  <th>Paid</th>
                  <th>Balance</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredOutstanding.map((p) => {
                  const st =
                    typeof p.studentId === "string"
                      ? null
                      : (p.studentId as { name: string; grade: string });
                  const bus =
                    typeof p.busId === "string" ? "—" : (p.busId as { busNumber: string }).busNumber;
                  const balance = Math.max(0, p.amount - p.amountPaid);
                  return (
                    <tr key={p._id} className="border-t border-slate-100">
                      <td className="py-2 font-medium">{st?.name ?? "—"}</td>
                      <td>{st?.grade ?? "—"}</td>
                      <td>{bus}</td>
                      <td className="tabular-nums">{formatINR(p.amount)}</td>
                      <td className="tabular-nums">{formatINR(p.amountPaid)}</td>
                      <td className="tabular-nums">{formatINR(balance)}</td>
                      <td>
                        <Badge status={p.status}>{p.status}</Badge>
                      </td>
                      <td>
                        <Button
                          variant="secondary"
                          className="text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setPayRow(p);
                            payForm.reset({
                              amountPaid: p.amount - p.amountPaid
                            });
                          }}
                        >
                          Mark paid
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Modal isOpen={!!payRow} onClose={() => setPayRow(null)} title="Mark payment">
        <form className="grid gap-3" onSubmit={payForm.handleSubmit((v) => recordPay.mutate(v))}>
          <input
            type="number"
            className="rounded border px-3 py-2"
            {...payForm.register("amountPaid")}
          />
          <Button type="submit" disabled={recordPay.isPending}>
            Save
          </Button>
        </form>
      </Modal>
    </PageWrapper>
  );
};

const ReportsPageFallback = (): JSX.Element => (
  <PageWrapper title="Financial reports">
    <TableSkeleton rows={8} />
  </PageWrapper>
);

export default function AdminReportsPage(): JSX.Element {
  return (
    <Suspense fallback={<ReportsPageFallback />}>
      <ReportsPageContent />
    </Suspense>
  );
}
