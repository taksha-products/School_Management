"use client";

import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useRef, useState, type JSX } from "react";

import { FeeReceiptCard } from "@/components/shared/FeeReceiptCard";
import { useToast } from "@/components/ui/Toast";
import { downloadReceiptPdf } from "@/lib/downloadReceiptPdf";
import { formatReceiptDisplayId, schoolReceiptPeriodLabel } from "@/lib/receiptFormat";
import type { SchoolFeeReceipt } from "@/types/schoolFees";

interface FeeReceiptPrintProps {
  receipt: SchoolFeeReceipt;
  title?: string;
  showPrintButton?: boolean;
}

const FeeReceiptPrintInner = ({
  receipt,
  title = "School Fee",
  showPrintButton = true
}: FeeReceiptPrintProps): JSX.Element => {
  const searchParams = useSearchParams();
  const { showToast } = useToast();
  const receiptRef = useRef<HTMLDivElement>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const didAutoDownload = useRef(false);

  const handleDownloadPdf = async (): Promise<void> => {
    if (!receiptRef.current) {
      return;
    }
    setPdfLoading(true);
    try {
      await downloadReceiptPdf(
        receiptRef.current,
        `school-fee-receipt-${formatReceiptDisplayId(receipt.receiptNumber)}.pdf`
      );
      showToast("success", "Receipt PDF downloaded");
    } catch {
      showToast("error", "Could not generate PDF");
    } finally {
      setPdfLoading(false);
    }
  };

  useEffect(() => {
    if (searchParams.get("download") !== "pdf" || didAutoDownload.current) {
      return;
    }
    didAutoDownload.current = true;
    void handleDownloadPdf();
  }, [searchParams]);

  const lineItems = receipt.feeHeadPayments.map((line) => ({
    label: line.feeHeadName,
    period: line.periodLabel,
    amount: line.amountPaid
  }));

  const status =
    receipt.totalAmountPaid >= receipt.totalAmountDue && receipt.totalAmountDue > 0
      ? "paid"
      : receipt.totalAmountPaid > 0
        ? "partial"
        : "pending";

  return (
    <div className="flex min-h-screen flex-col items-center bg-slate-100 p-6 print:bg-white">
      <FeeReceiptCard
        contentRef={receiptRef}
        branding={receipt.organization ?? null}
        receiptType={title}
        period={schoolReceiptPeriodLabel(receipt.feeHeadPayments)}
        receiptNumber={receipt.receiptNumber}
        studentName={receipt.studentName}
        studentMeta={receipt.grade}
        status={status}
        paymentDate={receipt.paymentDate}
        collectedBy={receipt.collectedBy}
        paymentMode={receipt.paymentMode}
        amountDue={receipt.totalAmountDue}
        amountPaid={receipt.totalAmountPaid}
        lineItems={lineItems.length > 1 ? lineItems : undefined}
        showActions={showPrintButton}
        pdfLoading={pdfLoading}
        onDownloadPdf={() => void handleDownloadPdf()}
        footerNote={
          receipt.notes ? (
            <p className="mt-2 text-center text-[11px] text-slate-500">Note: {receipt.notes}</p>
          ) : undefined
        }
      />
    </div>
  );
};

export const FeeReceiptPrint = (props: FeeReceiptPrintProps): JSX.Element => (
  <Suspense fallback={<p className="p-6 text-center text-slate-500">Loading receipt...</p>}>
    <FeeReceiptPrintInner {...props} />
  </Suspense>
);
