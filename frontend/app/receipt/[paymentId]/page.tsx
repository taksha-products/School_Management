"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState } from "react";

import { FeeReceiptCard } from "@/components/shared/FeeReceiptCard";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { downloadReceiptPdf } from "@/lib/downloadReceiptPdf";
import {
  formatBusLabel,
  formatReceiptDisplayId,
  formatTransportMonthPeriod
} from "@/lib/receiptFormat";
import type { ReceiptOrgBranding } from "@/types/orgTheme";

interface GroupedMonthRow {
  month: string;
  status: string;
  amountPaid: number;
  amountDue: number;
}

interface ReceiptData {
  studentName: string;
  busNumber: string;
  grade?: string;
  month: string;
  monthlyFee: number;
  amountPaid: number;
  amountDue?: number;
  status: string;
  paidAt?: string;
  collectedBy: string;
  receiptNumber: string;
  paymentMode?: string;
  organization?: ReceiptOrgBranding | null;
  isPartOfGroup?: boolean;
  isAdvance?: boolean;
  groupReceiptNumber?: string | null;
  groupedMonths?: GroupedMonthRow[];
}

const ReceiptContent = (): JSX.Element => {
  const params = useParams<{ paymentId: string }>();
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const autoDownload = searchParams.get("download") === "pdf";

  const receiptQuery = useQuery({
    queryKey: ["receipt", params.paymentId],
    queryFn: async () =>
      (
        await api.post<{ data: ReceiptData }>(`/api/fees/receipt/${params.paymentId}`)
      ).data.data
  });

  const receipt = receiptQuery.data;

  const handleDownloadPdf = async (): Promise<void> => {
    if (!receiptRef.current || !receipt) {
      return;
    }
    setPdfLoading(true);
    try {
      await downloadReceiptPdf(
        receiptRef.current,
        `transport-receipt-${formatReceiptDisplayId(receipt.receiptNumber)}.pdf`
      );
      showToast("success", "Receipt PDF downloaded");
    } catch {
      showToast("error", "Could not generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  const didAutoDownload = useRef(false);

  useEffect(() => {
    if (!autoDownload || !receipt || receiptQuery.isLoading || didAutoDownload.current) {
      return;
    }
    didAutoDownload.current = true;
    void handleDownloadPdf();
  }, [autoDownload, receipt, receiptQuery.isLoading]);

  if (receiptQuery.isLoading) {
    return <p className="p-8 text-center text-slate-500">Loading receipt...</p>;
  }

  if (!receipt) {
    return <p className="p-8 text-center text-rose-500">Receipt not found</p>;
  }

  const studentMeta = [receipt.grade, formatBusLabel(receipt.busNumber)]
    .filter(Boolean)
    .join(" · ");

  const isAdvance = receipt.isPartOfGroup && receipt.groupedMonths && receipt.groupedMonths.length > 0;

  const lineItems = isAdvance
    ? receipt.groupedMonths!.map((row) => ({
        label: formatTransportMonthPeriod(row.month),
        amount: row.amountPaid
      }))
    : undefined;

  const periodLabel = isAdvance
    ? receipt.groupedMonths!.map((g) => formatTransportMonthPeriod(g.month)).join(" · ")
    : formatTransportMonthPeriod(receipt.month);

  const receiptType = receipt.isAdvance ? "Advance Payment Receipt" : "Transport Fee";

  const displayReceiptNumber =
    receipt.groupReceiptNumber ?? receipt.receiptNumber;

  const amountDue = receipt.amountDue ?? receipt.monthlyFee;
  const amountPaid = receipt.amountPaid;

  return (
    <div className="mx-auto flex min-h-screen w-full flex-col items-center justify-center bg-slate-100 p-6 print:bg-white">
      <FeeReceiptCard
        contentRef={receiptRef}
        branding={receipt.organization ?? null}
        receiptType={receiptType}
        period={periodLabel}
        receiptNumber={displayReceiptNumber}
        studentName={receipt.studentName}
        studentMeta={studentMeta || "—"}
        status={receipt.status}
        paymentDate={receipt.paidAt}
        collectedBy={receipt.collectedBy}
        paymentMode={receipt.paymentMode}
        amountDue={amountDue}
        amountPaid={amountPaid}
        lineItems={lineItems}
        pdfLoading={pdfLoading}
        onDownloadPdf={() => void handleDownloadPdf()}
      />
    </div>
  );
};

const ReceiptPage = (): JSX.Element => (
  <Suspense fallback={<p className="p-8 text-center text-slate-500">Loading receipt...</p>}>
    <ReceiptContent />
  </Suspense>
);

export default ReceiptPage;
