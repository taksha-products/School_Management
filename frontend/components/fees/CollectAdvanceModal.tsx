"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { ReceiptDownload } from "@/components/payments/ReceiptDownload";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Modal } from "@/components/ui/Modal";
import { useToast } from "@/components/ui/Toast";
import { useFeatureEnabled } from "@/hooks/useOrgFeatures";
import {
  fetchTransportAdvancePreview,
  formatAdvanceMonthLabel,
  formatMonthListShort,
  pickEarliestUnpaidMonths,
  recordTransportAdvance,
  type AdvancePaymentModeUi,
  type TransportAdvanceMonthRow
} from "@/lib/transportAdvance";
import { formatINR } from "@/lib/utils";

interface CollectAdvanceModalProps {
  isOpen: boolean;
  onClose: () => void;
  studentId: string;
  studentName: string;
  busRoute: string;
  academicYear: string;
  fromMonth: string;
  onSuccess: () => void;
}

export const CollectAdvanceModal = ({
  isOpen,
  onClose,
  studentId,
  studentName,
  busRoute,
  academicYear,
  fromMonth,
  onSuccess
}: CollectAdvanceModalProps): JSX.Element | null => {
  const { showToast } = useToast();
  const onlinePaymentsEnabled = useFeatureEnabled("onlinePayments");
  const [selectedMonths, setSelectedMonths] = useState<string[]>([]);
  const [paymentMode, setPaymentMode] = useState<AdvancePaymentModeUi>("cash");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [receiptPaymentId, setReceiptPaymentId] = useState<string | null>(null);

  const previewQuery = useQuery({
    queryKey: ["transport-advance-preview", studentId, academicYear, fromMonth],
    queryFn: () => fetchTransportAdvancePreview(studentId, academicYear, fromMonth),
    enabled: isOpen && !!studentId
  });

  const preview = previewQuery.data;
  const monthlyFee = preview?.monthlyFee ?? 0;

  useEffect(() => {
    if (!isOpen) {
      setSelectedMonths([]);
      setPaymentMode("cash");
      setNote("");
      setSubmitting(false);
      setReceiptPaymentId(null);
      return;
    }
    if (preview?.months) {
      setSelectedMonths(pickEarliestUnpaidMonths(preview.months, 1));
    }
  }, [isOpen, preview?.months]);

  const totalAmount = useMemo(() => {
    if (!preview) {
      return 0;
    }
    return selectedMonths.reduce((sum, monthKey) => {
      const row = preview.months.find((m) => m.month === monthKey);
      return sum + (row?.amount ?? monthlyFee);
    }, 0);
  }, [preview, selectedMonths, monthlyFee]);

  const toggleMonth = (row: TransportAdvanceMonthRow): void => {
    if (!row.selectable) {
      return;
    }
    setSelectedMonths((prev) =>
      prev.includes(row.month)
        ? prev.filter((m) => m !== row.month)
        : [...prev, row.month].sort()
    );
  };

  const applyQuickSelect = (count: number): void => {
    if (!preview) {
      return;
    }
    setSelectedMonths(pickEarliestUnpaidMonths(preview.months, count));
  };

  const paymentModes = useMemo((): Array<{ id: AdvancePaymentModeUi; label: string }> => {
    const modes: Array<{ id: AdvancePaymentModeUi; label: string }> = [
      { id: "cash", label: "Cash" }
    ];
    if (onlinePaymentsEnabled) {
      modes.push({ id: "upi", label: "UPI" }, { id: "online", label: "Online" });
    }
    return modes;
  }, [onlinePaymentsEnabled]);

  useEffect(() => {
    if (!paymentModes.some((m) => m.id === paymentMode)) {
      setPaymentMode("cash");
    }
  }, [paymentMode, paymentModes]);

  const handleSubmit = async (): Promise<void> => {
    if (selectedMonths.length === 0 || !preview) {
      return;
    }
    setSubmitting(true);
    try {
      const result = await recordTransportAdvance({
        studentId,
        academicYear,
        months: selectedMonths,
        amountPaid: totalAmount,
        paymentMode,
        notes: note.trim() || undefined
      });
      const paymentId = result.primaryPaymentId ?? result.payments[0]?._id ?? null;
      setReceiptPaymentId(paymentId);
      showToast(
        "success",
        `${formatINR(totalAmount)} collected for ${formatMonthListShort(selectedMonths)}`
      );
      onSuccess();
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "response" in err
          ? (err as { response?: { data?: { message?: string } } }).response?.data?.message
          : undefined;
      showToast("error", message ?? "Could not record advance payment");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = (): void => {
    if (submitting) {
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
        receiptPaymentId ? (
          <ReceiptDownload
            feeType="transport"
            receiptNumber={`ADV-${receiptPaymentId.slice(-6).toUpperCase()}`}
            paymentId={receiptPaymentId}
          />
        ) : (
          <div className="flex w-full justify-end gap-2">
            <Button variant="secondary" onClick={handleClose} disabled={submitting}>
              Cancel
            </Button>
            <Button
              onClick={() => void handleSubmit()}
              disabled={submitting || selectedMonths.length === 0}
            >
              {submitting ? "Recording…" : `Collect ${formatINR(totalAmount)}`}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <div className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-600">
          <p>
            <span className="font-medium text-slate-900">{studentName}</span>
            {busRoute ? ` · ${busRoute}` : null}
          </p>
          <p className="mt-0.5">
            Monthly transport fee:{" "}
            <span className="font-semibold text-slate-900">{formatINR(monthlyFee)}</span>
          </p>
        </div>

        {previewQuery.isLoading ? (
          <p className="text-sm text-slate-500">Loading months…</p>
        ) : null}

        {previewQuery.isError ? (
          <p className="text-sm text-rose-600">Could not load transport fee months.</p>
        ) : null}

        {preview ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={() => applyQuickSelect(1)}>
                1 Month
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => applyQuickSelect(3)}>
                3 Months
              </Button>
              <Button type="button" variant="secondary" size="sm" onClick={() => applyQuickSelect(6)}>
                6 Months
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => applyQuickSelect(12)}
              >
                Full Year
              </Button>
            </div>

            <div className="max-h-64 space-y-1 overflow-y-auto rounded-lg border border-slate-200 p-2">
              {preview.months.map((row) => {
                const checked = selectedMonths.includes(row.month);
                const overdue = row.status === "overdue";
                return (
                  <label
                    key={row.month}
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
                      onChange={() => toggleMonth(row)}
                    />
                    <span className="min-w-0 flex-1 font-medium text-slate-800">
                      {formatAdvanceMonthLabel(row.month)}
                    </span>
                    <span className="text-slate-600">{formatINR(row.amount)}</span>
                    {row.status === "paid" ? (
                      <Badge status="paid">Paid</Badge>
                    ) : row.status === "partial" ? (
                      <Badge status="partial">Partial</Badge>
                    ) : overdue ? (
                      <Badge status="overdue">Overdue</Badge>
                    ) : (
                      <Badge status="pending">Pending</Badge>
                    )}
                  </label>
                );
              })}
            </div>

            <p className="text-sm font-medium text-slate-800">
              {selectedMonths.length} month{selectedMonths.length === 1 ? "" : "s"} selected → Total:{" "}
              <span className="text-base text-emerald-700">{formatINR(totalAmount)}</span>
            </p>

            <fieldset>
              <legend className="mb-2 text-sm font-medium text-slate-700">Payment mode</legend>
              <div className="flex flex-wrap gap-4">
                {paymentModes.map((mode) => (
                  <label key={mode.id} className="inline-flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name="advance-payment-mode"
                      checked={paymentMode === mode.id}
                      onChange={() => setPaymentMode(mode.id)}
                    />
                    {mode.label}
                  </label>
                ))}
              </div>
            </fieldset>

            <label className="block text-sm">
              <span className="mb-1 block font-medium text-slate-700">Note (optional)</span>
              <input
                type="text"
                value={note}
                onChange={(e) => setNote(e.target.value)}
                className="w-full rounded-md border border-slate-200 px-3 py-2 text-sm"
                placeholder="Reference or remark"
                maxLength={200}
              />
            </label>
          </>
        ) : null}
      </div>
    </Modal>
  );
};
