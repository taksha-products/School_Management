"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { StudentFeeLedgerView } from "@/types/schoolFees";

const ChildFeesPage = (): JSX.Element => {
  const params = useParams<{ studentId: string }>();
  const [tab, setTab] = useState<"dues" | "history">("dues");

  const ledgerQuery = useQuery({
    queryKey: ["parent-child-ledger", params.studentId],
    queryFn: async () =>
      (
        await api.get<{ data: StudentFeeLedgerView }>(
          `/api/parent/children/${params.studentId}/fees`,
          { params: { academicYear: ACADEMIC_YEAR } }
        )
      ).data.data
  });

  const paymentsQuery = useQuery({
    queryKey: ["parent-child-payments", params.studentId],
    queryFn: async () =>
      (
        await api.get<{ data: StudentFeeLedgerView["paymentHistory"] }>(
          `/api/parent/children/${params.studentId}/payments`,
          { params: { academicYear: ACADEMIC_YEAR } }
        )
      ).data.data,
    enabled: tab === "history"
  });

  const ledger = ledgerQuery.data;
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const allPeriods =
    ledger?.feeHeads.flatMap((h) =>
      h.periods.map((p) => ({ ...p, feeHeadName: h.feeHeadName }))
    ) ?? [];

  const overdue = allPeriods.filter((p) => p.status === "overdue");
  const thisMonth = allPeriods.filter((p) => {
    if (!p.dueDate) return false;
    const d = new Date(p.dueDate);
    return d >= monthStart && d <= monthEnd && ["pending", "partial"].includes(p.status);
  });
  const upcoming = allPeriods.filter((p) => {
    if (!p.dueDate) return false;
    return new Date(p.dueDate) > monthEnd && ["pending", "partial"].includes(p.status);
  });

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{ledger?.student.name ?? "Student"}</h1>
      <p className="mb-4 text-slate-600">Grade {ledger?.student.grade}</p>
      <p className="mb-6 text-2xl font-bold text-rose-600">
        Outstanding: {formatINR(ledger?.summary.outstandingBalance ?? 0)}
      </p>

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "dues" ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600 hover:text-primary"}`}
          onClick={() => setTab("dues")}
        >
          Outstanding Dues
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "history" ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600 hover:text-primary"}`}
          onClick={() => setTab("history")}
        >
          Payment History
        </button>
      </div>

      {tab === "dues" ? (
        <div className="space-y-6">
          <DueGroup title="Overdue" color="red" items={overdue} />
          <DueGroup title="Due this month" color="orange" items={thisMonth} />
          <DueGroup title="Upcoming" color="grey" items={upcoming} />
          <p className="text-sm text-slate-500">
            Visit school office or contact admin to pay fees. Online payment coming in Phase 2.
          </p>
        </div>
      ) : (
        <Card>
          <ul className="divide-y text-sm">
            {(paymentsQuery.data ?? []).map((p) => (
              <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{p.receiptNumber}</p>
                  <p className="text-slate-500">
                    {new Date(p.paymentDate).toLocaleDateString("en-IN")} · {p.paymentMode}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatINR(p.totalAmountPaid)}</p>
                  <Link
                    href={`/parent/receipt/${p.receiptNumber}`}
                    className="text-amber-600 hover:underline"
                  >
                    View Receipt
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

const DueGroup = ({
  title,
  color,
  items
}: {
  title: string;
  color: "red" | "orange" | "grey";
  items: Array<{ feeHeadName: string; displayLabel: string; amountDue: number; dueDate?: string; status: string }>;
}): JSX.Element | null => {
  if (!items.length) return null;
  const border =
    color === "red" ? "border-rose-200" : color === "orange" ? "border-orange-200" : "border-slate-200";
  return (
    <Card className={border}>
      <h3 className="mb-3 font-semibold">{title}</h3>
      <div className="space-y-2 text-sm">
        {items.map((item) => (
          <div
            key={`${item.feeHeadName}-${item.displayLabel}`}
            className="flex justify-between border-b border-slate-100 py-2 last:border-0"
          >
            <span>
              {item.feeHeadName} · {item.displayLabel}
            </span>
            <span className="flex items-center gap-2">
              {formatINR(item.amountDue)}
              <Badge status={item.status as "paid" | "partial" | "pending" | "overdue"} />
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
};

export default ChildFeesPage;
