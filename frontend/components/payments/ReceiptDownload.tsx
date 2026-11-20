"use client";

import { useState } from "react";

import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/Toast";
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

  const handleDownload = (): void => {
    setLoading(true);
    try {
      if (feeType === "transport" && paymentId) {
        window.open(`/receipt/${paymentId}?download=pdf`, "_blank", "noopener,noreferrer");
      } else {
        window.open(
          `${schoolReceiptPath}/${receiptNumber}?download=pdf`,
          "_blank",
          "noopener,noreferrer"
        );
      }
      showToast("success", "Opening receipt PDF…");
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
