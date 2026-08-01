"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

import { PaymentModeModal } from "@/components/payments/PaymentModeModal";
import { StudentSearch } from "@/components/shared/StudentSearch";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";
import { createSchoolPaymentIntent } from "@/lib/payments";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";
import type { LedgerPeriod, StudentFeeLedgerView } from "@/types/schoolFees";

type SelectedLine = {
  feeHeadName: string;
  periodLabel: string;
  amountDue: number;
  balance: number;
  amountPaid: number;
};

type PaymentLineInput = {
  feeHeadName: string;
  periodLabel: string;
  amountPaid: number;
};

interface SchoolFeesCollectViewProps {
  receiptBasePath: string;
  historyPath?: (studentId: string) => string;
}

interface PaymentModalState {
  feePaymentId: string;
  amount: number;
  description: string;
  studentName: string;
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
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [paymentModal, setPaymentModal] = useState<PaymentModalState | null>(null);
  const [collectingKey, setCollectingKey] = useState<string | null>(null);
  const [collectingSummary, setCollectingSummary] = useState(false);

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
  const totalPay = selectedList.reduce((sum, line) => sum + line.amountPaid, 0);

  const startPaymentCollection = async (
    payments: PaymentLineInput[],
    options?: { rowKey?: string; fromSummary?: boolean }
  ): Promise<void> => {
    if (!student || payments.length === 0) {
      return;
    }

    if (options?.rowKey) {
      setCollectingKey(options.rowKey);
    }
    if (options?.fromSummary) {
      setCollectingSummary(true);
    }

    try {
      const intent = await createSchoolPaymentIntent(student._id, academicYear, payments);
      setPaymentModal({
        feePaymentId: intent.feePaymentId,
        amount: intent.amount,
        description: intent.description,
        studentName: student.name
      });
    } catch {
      showToast("error", "Could not start payment collection");
    } finally {
      setCollectingKey(null);
      setCollectingSummary(false);
    }
  };

  const openPaymentModal = async (row: (typeof flatPeriods)[0]): Promise<void> => {
    await startPaymentCollection(
      [
        {
          feeHeadName: row.feeHeadName,
          periodLabel: row.periodLabel,
          amountPaid: row.balance
        }
      ],
      { rowKey: row.key }
    );
  };

  const openSummaryPaymentModal = async (): Promise<void> => {
    await startPaymentCollection(
      selectedList.map((line) => ({
        feeHeadName: line.feeHeadName,
        periodLabel: line.periodLabel,
        amountPaid: line.amountPaid
      })),
      { fromSummary: true }
    );
  };

  const handlePaymentSuccess = (receiptNumber: string): void => {
    queryClient.invalidateQueries({ queryKey: ["school-fee-ledger"] });
    setSelected({});
    showToast("success", `Payment recorded — ${receiptNumber}`);
    setPaymentModal(null);
    window.open(`${receiptBasePath}/${receiptNumber}`, "_blank");
  };

  const toggleRow = (row: (typeof flatPeriods)[0], checked: boolean) => {
    if (!checked) {
      setSelected((prev) => {
        const next = { ...prev };
        delete next[row.key];
        return next;
      });
      return;
    }
    setSelected((prev) => ({
      ...prev,
      [row.key]: {
        feeHeadName: row.feeHeadName,
        periodLabel: row.periodLabel,
        amountDue: row.amountDue,
        balance: row.balance,
        amountPaid: row.balance
      }
    }));
  };

  const canCollectRow = (status: string): boolean =>
    status === "pending" || status === "partial" || status === "overdue";

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
                      <th>Actions</th>
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
                          <td onClick={(e) => e.stopPropagation()}>
                            {canCollectRow(row.status) && (
                              <Button
                                variant="secondary"
                                disabled={collectingKey === row.key}
                                onClick={() => openPaymentModal(row)}
                              >
                                {collectingKey === row.key ? "..." : "Collect"}
                              </Button>
                            )}
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
                    <span>{formatINR(line.amountPaid)}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mb-3 text-lg font-bold">Total: {formatINR(totalPay)}</p>
            <Button
              className="w-full"
              disabled={selectedList.length === 0 || collectingSummary}
              onClick={() => void openSummaryPaymentModal()}
            >
              {collectingSummary ? "Starting..." : "Collect Payment"}
            </Button>
          </Card>
        </div>
      )}

      {student && paymentModal && (
        <PaymentModeModal
          isOpen={!!paymentModal}
          onClose={() => setPaymentModal(null)}
          studentName={paymentModal.studentName}
          studentId={student._id}
          feePaymentId={paymentModal.feePaymentId}
          feeType="school"
          amount={paymentModal.amount}
          description={paymentModal.description}
          onSuccess={handlePaymentSuccess}
          schoolReceiptPath={receiptBasePath}
        />
      )}
    </div>
  );
};
