"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { FeeReceiptPrint } from "@/components/shared/FeeReceiptPrint";
import { api } from "@/lib/api";
import type { SchoolFeeReceipt } from "@/types/schoolFees";

const ParentReceiptPage = (): JSX.Element => {
  const params = useParams<{ receiptNumber: string }>();

  const receiptQuery = useQuery({
    queryKey: ["parent-receipt", params.receiptNumber],
    queryFn: async () =>
      (
        await api.get<{ data: SchoolFeeReceipt }>(
          `/api/parent/receipt/${params.receiptNumber}`
        )
      ).data.data
  });

  if (receiptQuery.isLoading) {
    return <p className="text-center text-slate-500">Loading receipt...</p>;
  }
  if (!receiptQuery.data) {
    return <p className="text-center text-rose-500">Receipt not found</p>;
  }

  return (
    <div className="py-4">
      <FeeReceiptPrint receipt={receiptQuery.data} />
    </div>
  );
};

export default ParentReceiptPage;
