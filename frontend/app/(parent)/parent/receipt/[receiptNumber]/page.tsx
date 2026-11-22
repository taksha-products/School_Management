"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import type { JSX } from "react";

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
    return <p className="py-10 text-center text-[#71717A]">Loading receipt...</p>;
  }
  if (!receiptQuery.data) {
    return <p className="py-10 text-center text-rose-500">Receipt not found</p>;
  }

  return (
    <div className="py-3">
      <Link
        href="/parent/payments"
        aria-label="Go back"
        className="mb-4 inline-flex h-11 w-11 items-center justify-center rounded-full bg-[#F4F5F6] text-[#141414] transition hover:bg-[#EBECEE]"
      >
        <ArrowLeft className="h-5 w-5" />
      </Link>
      <FeeReceiptPrint receipt={receiptQuery.data} />
    </div>
  );
};

export default ParentReceiptPage;
