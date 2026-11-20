"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { api } from "@/lib/api";
import {
  ledgerToAdvanceRows,
  pickEarliestSchoolPeriodKeys,
  type SchoolAdvanceRow
} from "@/lib/schoolAdvance";
import { formatINR } from "@/lib/utils";
import type { StudentFeeLedgerView } from "@/types/schoolFees";

export type SchoolAdvancePaymentLine = {
  feeHeadName: string;
  periodLabel: string;
  amountPaid: number;
};

interface CollectSchoolAdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  academicYear: string;
  onConfirm: (payments: SchoolAdvancePaymentLine[], totalAmount: number) => void;
  confirming?: boolean;
}

export const CollectSchoolAdvanceModal = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  academicYear,
  onConfirm,
  confirming = false
}: CollectSchoolAdvanceModalProps): JSX.Element | null => {
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);

  const ledgerQuery = useQuery({
    queryKey: ["school-fee-ledger", studentId, academicYear, "advance-modal"],
    queryFn: async () =>
      (
        await api.get<{ data: StudentFeeLedgerView }>("/api/school-fees/ledger", {
          params: { studentId, academicYear }
        })
      ).data.data,
    enabled: isOpen && !!studentId
  });

  const rows = useMemo(() => ledgerToAdvanceRows(ledgerQuery.data), [ledgerQuery.data]);
  const selectableRows = rows.filter((r) => r.selectable);

  useEffect(() => {
    if (!isOpen) {
      setSelectedKeys([]);
      return;
    }
    if (selectableRows.length > 0) {
      setSelectedKeys(pickEarliestSchoolPeriodKeys(selectableRows, 1));
    }
  }, [isOpen, selectableRows]);

  const totalAmount = useMemo(
    () =>
      selectedKeys.reduce((sum, key) => {
        const row = rows.find((r) => r.key === key);
        return sum + (row?.balance ?? 0);
      }, 0),
    [rows, selectedKeys]
  );

  const toggleRow = (row: SchoolAdvanceRow): void => {
    if (!row.selectable) {
      return;
    }
    setSelectedKeys((prev) =>
      prev.includes(row.key) ? prev.filter((k) => k !== row.key) : [...prev, row.key].sort()
    );
  };

  const applyQuickSelect = (count: number): void => {
    setSelectedKeys(pickEarliestSchoolPeriodKeys(selectableRows, count));
  };

  const handleConfirm = (): void => {
    if (selectedKeys.length === 0) {
      return;
    }
    const payments: SchoolAdvancePaymentLine[] = selectedKeys
      .map((key) => rows.find((r) => r.key === key))
      .filter((r): r is SchoolAdvanceRow => !!r && r.selectable)
      .map((r) => ({
        feeHeadName: r.feeHeadName,
        periodLabel: r.periodLabel,
        amountPaid: r.balance
      }));
    onConfirm(payments, totalAmount);
  };

  const handleClose = (): void => {
    if (confirming) {
      return;
    }
    onClose();
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={handleClose}
      title={`Collect Advance — ${studentName}`}
      size="large"
      footer={
        <div className="flex w-full justify-end gap-2">
          <Button variant="secondary" onClick={handleClose} disabled={confirming}>
            Cancel
          </Button>
          <Button
            onClick={handleConfirm}
            disabled={confirming || selectedKeys.length === 0}
          >
            {confirming ? "Starting…" : `Continue · ${formatINR(totalAmount)}`}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          Select one or more school fee periods (including future months). Payment mode is chosen on
          the next step — same as multi-row collect on the ledger.
        </p>

        {ledgerQuery.isLoading ? <p className="text-sm text-slate-500">Loading fee periods…</p> : null}
        {ledgerQuery.isError ? (
          <p className="text-sm text-rose-600">Could not load school fee ledger.</p>
        ) : null}

        {ledgerQuery.data ? (
          selectableRows.length === 0 ? (
            <p className="text-sm text-slate-500">No unpaid school fee periods for this year.</p>
          ) : (
            <>
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => applyQuickSelect(1)}>
                  1 Period
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => applyQuickSelect(3)}>
                  3 Periods
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => applyQuickSelect(6)}>
                  6 Periods
                </Button>
                <Button type="button" variant="secondary" size="sm" onClick={() => applyQuickSelect(12)}>
                  Up to 12
                </Button>
              </div>

              <div className="max-h-72 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
                {rows.map((row) => {
                  const checked = selectedKeys.includes(row.key);
                  const overdue = row.status === "overdue";
                  return (
                    <label
                      key={row.key}
                      className={`flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm ${
                        row.selectable
                          ? overdue
                            ? "bg-amber-50 hover:bg-amber-100/80"
                            : "hover:bg-slate-50"
                          : "cursor-not-allowed bg-slate-50 opacity-70"
                      }`}
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300"
                        checked={checked}
                        disabled={!row.selectable}
                        onChange={() => toggleRow(row)}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="font-medium text-slate-800">{row.displayLabel}</span>
                        <span className="ml-1 text-slate-500">· {row.feeHeadName}</span>
                      </span>
                      <span className="text-slate-600">{formatINR(row.balance)}</span>
                      {row.status === "paid" ? (
                        <Badge status="paid">Paid</Badge>
                      ) : row.status === "partial" ? (
                        <Badge status="partial">Partial</Badge>
                      ) : overdue ? (
                        <Badge status="overdue">Overdue</Badge>
                      ) : row.selectable ? (
                        <Badge status="pending">Pending</Badge>
                      ) : null}
                    </label>
                  );
                })}
              </div>

              <p className="text-sm font-medium text-slate-800">
                {selectedKeys.length} period{selectedKeys.length === 1 ? "" : "s"} selected → Total:{" "}
                <span className="text-base text-emerald-700">{formatINR(totalAmount)}</span>
              </p>
            </>
          )
        ) : null}
      </div>
    </Modal>
  );
};
