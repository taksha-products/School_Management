"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { FeeReceiptPrint } from "@/components/shared/FeeReceiptPrint";
import { api } from "@/lib/api";
import type { SchoolFeeReceipt } from "@/types/schoolFees";

const StaffSchoolFeeReceiptPage = (): JSX.Element => {
  const params = useParams<{ receiptNumber: string }>();

  const receiptQuery = useQuery({
    queryKey: ["school-receipt", params.receiptNumber],
    queryFn: async () =>
      (
        await api.get<{ data: SchoolFeeReceipt }>(
          `/api/school-fees/receipt/${params.receiptNumber}`
        )
      ).data.data
  });

  if (receiptQuery.isLoading) {
    return <p className="p-8 text-center text-slate-500">Loading receipt...</p>;
  }
  if (!receiptQuery.data) {
    return <p className="p-8 text-center text-rose-500">Receipt not found</p>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 print:bg-white">
      <FeeReceiptPrint receipt={receiptQuery.data} />
    </div>
  );
};

export default StaffSchoolFeeReceiptPage;
