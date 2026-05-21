"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { StudentSearch } from "@/components/shared/StudentSearch";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";
import type { LedgerPeriod, SchoolPaymentMode, StudentFeeLedgerView } from "@/types/schoolFees";

type SelectedLine = {
  feeHeadName: string;
  periodLabel: string;
  amountDue: number;
  balance: number;
  amountPaid: number;
  lateFee: number;
};

interface SchoolFeesCollectViewProps {
  receiptBasePath: string;
  historyPath?: (studentId: string) => string;
}

export const SchoolFeesCollectView = ({
  receiptBasePath,
  historyPath
}: SchoolFeesCollectViewProps): JSX.Element => {
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const [student, setStudent] = useState<Student | null>(null);
  const [academicYear, setAcademicYear] = useState(ACADEMIC_YEAR);
  const [selected, setSelected] = useState<Record<string, SelectedLine>>({});
  const [paymentMode, setPaymentMode] = useState<SchoolPaymentMode>("cash");
  const [upiTransactionId, setUpiTransactionId] = useState("");
  const [notes, setNotes] = useState("");
  const [editingKey, setEditingKey] = useState<string | null>(null);

  const preselectId = searchParams.get("studentId");

  useEffect(() => {
    if (!preselectId) return;
    api.get<{ data: Student }>(`/api/students/${preselectId}`).then((res) => {
      setStudent(res.data.data);
    });
  }, [preselectId]);

  const ledgerQuery = useQuery({
    queryKey: ["school-fee-ledger", student?._id, academicYear],
    queryFn: async () =>
      (
        await api.get<{ data: StudentFeeLedgerView }>("/api/school-fees/ledger", {
          params: { studentId: student?._id, academicYear }
        })
      ).data.data,
    enabled: !!student?._id
  });

  const flatPeriods = useMemo(() => {
    const rows: Array<LedgerPeriod & { feeHeadName: string; key: string }> = [];
    for (const head of ledgerQuery.data?.feeHeads ?? []) {
      for (const period of head.periods) {
        if (period.balance <= 0 && period.status === "paid") continue;
        rows.push({
          ...period,
          feeHeadName: head.feeHeadName,
          key: `${head.feeHeadName}::${period.periodLabel}`
        });
      }
    }
    return rows;
  }, [ledgerQuery.data]);

  const selectedList = Object.values(selected);
  const totalPay = selectedList.reduce((s, l) => s + l.amountPaid + l.lateFee, 0);

  const collectMutation = useMutation({
    mutationFn: async () => {
      if (!student) return;
      return api.post("/api/school-fees/collect", {
        studentId: student._id,
        academicYear,
        paymentMode,
        upiTransactionId: paymentMode === "upi" || paymentMode === "online" ? upiTransactionId : undefined,
        payments: selectedList.map((l) => ({
          feeHeadName: l.feeHeadName,
          periodLabel: l.periodLabel,
          amountPaid: l.amountPaid,
          lateFee: l.lateFee
        })),
        notes
      });
    },
    onSuccess: (res) => {
      const receipt = res?.data?.data?.receiptNumber as string;
      queryClient.invalidateQueries({ queryKey: ["school-fee-ledger"] });
      setSelected({});
      showToast("success", "Payment collected");
      if (receipt) {
        window.open(`${receiptBasePath}/${receipt}`, "_blank");
      }
    },
    onError: () => showToast("error", "Failed to collect payment")
  });

  const toggleRow = (row: (typeof flatPeriods)[0], checked: boolean) => {
    if (!checked) {
      setSelected((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      return;
    }
    const late =
      row.status === "overdue" ? Math.round(row.balance * 0.02) : 0;
    setSelected((prev) => ({
      ...prev,
      [row.key]: {
        feeHeadName: row.feeHeadName,
        periodLabel: row.periodLabel,
        amountDue: row.amountDue,
        balance: row.balance,
        amountPaid: row.balance,
        lateFee: late
      }
    }));
  };

  const ledger = ledgerQuery.data;
  const busLabel =
    ledger?.student?.bus && typeof ledger.student.bus === "object"
      ? ledger.student.bus.busNumber
      : "";

  return (
    <div className="space-y-4">
      <Card>
        <StudentSearch
          onSelect={(s) => {
            setStudent(s);
            setSelected({});
          }}
          placeholder="Search student by name to collect fees..."
        />
        <div className="mt-2 flex gap-2">
          <select
            value={academicYear}
            onChange={(e) => setAcademicYear(e.target.value)}
            className="rounded border border-slate-200 px-3 py-2 text-sm"
          >
            <option value={ACADEMIC_YEAR}>{ACADEMIC_YEAR}</option>
          </select>
        </div>
      </Card>

      {student && (
        <div className="grid gap-4 xl:grid-cols-[280px_1fr_300px]">
          <Card className="h-fit">
            <h3 className="mb-2 font-semibold text-slate-900">{student.name}</h3>
            <p className="text-sm text-slate-600">Grade {student.grade}</p>
            <p className="text-sm text-slate-600">Bus {busLabel || "—"}</p>
            <p className="mt-2 text-sm text-slate-600">{ledger?.student.parentPhone}</p>
            <p
              className={`mt-4 text-2xl font-bold ${
                (ledger?.summary.outstandingBalance ?? 0) > 0 ? "text-rose-600" : "text-emerald-600"
              }`}
            >
              {formatINR(ledger?.summary.outstandingBalance ?? 0)}
            </p>
            <p className="text-xs text-slate-500">Outstanding balance</p>
            {historyPath && (
              <Link
                href={historyPath(student._id)}
                className="mt-3 inline-block text-sm text-amber-600 hover:underline"
              >
                View Full History
              </Link>
            )}
          </Card>

          <Card>
            <h3 className="mb-3 font-semibold">Fee Ledger</h3>
            {ledgerQuery.isLoading ? (
              <p className="text-sm text-slate-500">Loading ledger...</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-[700px] w-full text-sm">
                  <thead className="text-left text-slate-500">
                    <tr>
                      <th className="p-2">Select</th>
                      <th>Fee Head</th>
                      <th>Period</th>
                      <th>Due</th>
                      <th>Due Date</th>
                      <th>Balance</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {flatPeriods.map((row) => {
                      const isSelected = !!selected[row.key];
                      return (
                        <tr
                          key={row.key}
                          className="cursor-pointer border-t border-gray-100 hover:bg-primary-50"
                          onClick={() => setEditingKey(row.key)}
                        >
                          <td className="p-2" onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => toggleRow(row, e.target.checked)}
                            />
                          </td>
                          <td className="p-2">{row.feeHeadName}</td>
                          <td>{row.displayLabel}</td>
                          <td>{formatINR(row.amountDue)}</td>
                          <td>
                            {row.dueDate
                              ? new Date(row.dueDate).toLocaleDateString("en-IN")
                              : "—"}
                          </td>
                          <td>{formatINR(row.balance)}</td>
                          <td>
                            <Badge
                              status={
                                row.status === "paid" ||
                                row.status === "partial" ||
                                row.status === "pending" ||
                                row.status === "overdue"
                                  ? row.status
                                  : undefined
                              }
                            >
                              {row.status}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            {editingKey && selected[editingKey] && (
              <div className="mt-3 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800">
                <p className="mb-2 font-medium">Adjust payment for selected row</p>
                <div className="grid gap-2 md:grid-cols-2">
                  <label>
                    Amount to pay
                    <input
                      type="number"
                      className="mt-1 w-full rounded border px-2 py-1"
                      value={selected[editingKey].amountPaid}
                      onChange={(e) =>
                        setSelected((prev) => ({
                          ...prev,
                          [editingKey]: {
                            ...prev[editingKey],
                            amountPaid: Number(e.target.value)
                          }
                        }))
                      }
                    />
                  </label>
                  <label>
                    Late fee
                    <input
                      type="number"
                      className="mt-1 w-full rounded border px-2 py-1"
                      value={selected[editingKey].lateFee}
                      onChange={(e) =>
                        setSelected((prev) => ({
                          ...prev,
                          [editingKey]: {
                            ...prev[editingKey],
                            lateFee: Number(e.target.value)
                          }
                        }))
                      }
                    />
                  </label>
                </div>
              </div>
            )}
          </Card>

          <Card className="h-fit">
            <h3 className="mb-3 font-semibold">Collection Summary</h3>
            {selectedList.length === 0 ? (
              <p className="text-sm text-slate-500">Select fee rows to collect</p>
            ) : (
              <ul className="mb-3 space-y-2 text-sm">
                {selectedList.map((line) => (
                  <li key={`${line.feeHeadName}-${line.periodLabel}`} className="flex justify-between">
                    <span>
                      {line.feeHeadName} ({line.periodLabel})
                    </span>
                    <span>{formatINR(line.amountPaid + line.lateFee)}</span>
                  </li>
                ))}
              </ul>
            )}
            <label className="mb-2 block text-sm">
              Payment mode
              <select
                className="mt-1 w-full rounded border px-2 py-2"
                value={paymentMode}
                onChange={(e) => setPaymentMode(e.target.value as SchoolPaymentMode)}
              >
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="cheque">Cheque</option>
                <option value="online">Online</option>
              </select>
            </label>
            {(paymentMode === "upi" || paymentMode === "online") && (
              <label className="mb-2 block text-sm">
                UPI / Transaction ID
                <input
                  className="mt-1 w-full rounded border px-2 py-2"
                  value={upiTransactionId}
                  onChange={(e) => setUpiTransactionId(e.target.value)}
                />
              </label>
            )}
            <label className="mb-3 block text-sm">
              Notes
              <textarea
                className="mt-1 w-full rounded border px-2 py-2"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </label>
            <p className="mb-3 text-lg font-bold">Total: {formatINR(totalPay)}</p>
            <Button
              className="w-full"
              disabled={selectedList.length === 0 || collectMutation.isPending}
              onClick={() => collectMutation.mutate()}
            >
              {collectMutation.isPending ? "Processing..." : "Collect & Print Receipt"}
            </Button>
          </Card>
        </div>
      )}
    </div>
  );
};
