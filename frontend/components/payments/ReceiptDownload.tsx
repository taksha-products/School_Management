"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { triggerBlobDownload } from "@/lib/fileDownload";
import type { FeeType } from "@/lib/payments";

interface Props {
  receiptNumber: string;
  feeType: FeeType;
  /** Transport receipts use payment MongoDB id for print page */
  paymentId?: string;
  /** School fee receipt print path, e.g. /admin/school-fees/receipt */
  schoolReceiptPath?: string;
  variant?: "primary" | "secondary";
  className?: string;
}

export const ReceiptDownload = ({
  receiptNumber,
  feeType,
  paymentId,
  schoolReceiptPath = "/parent/receipt",
  variant = "secondary",
  className
}: Props): JSX.Element => {
  const { showToast } = useToast();
  const [loading, setLoading] = useState(false);

  const handleDownload = async (): Promise<void> => {
    setLoading(true);
    try {
      if (feeType === "transport" && paymentId) {
        const res = await api.get(`/api/fees/receipt/${paymentId}`);
        const blob = new Blob([JSON.stringify(res.data, null, 2)], {
          type: "application/json"
        });
        triggerBlobDownload(blob, `receipt-${receiptNumber}.json`);
        window.open(`/receipt/${paymentId}`, "_blank");
      } else {
        const res = await api.get(`/api/school-fees/receipt/${receiptNumber}`);
        const blob = new Blob([JSON.stringify(res.data, null, 2)], {
          type: "application/json"
        });
        triggerBlobDownload(blob, `receipt-${receiptNumber}.json`);
        window.open(`${schoolReceiptPath}/${receiptNumber}`, "_blank");
      }
      showToast("success", "Receipt opened");
    } catch {
      showToast("error", "Could not download receipt");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Button
      variant={variant}
      className={className}
      disabled={loading}
      onClick={handleDownload}
    >
      {loading ? "Downloading..." : "Download Receipt"}
    </Button>
  );
};
