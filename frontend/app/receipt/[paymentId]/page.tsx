"use client";

import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";

import { ReceiptOrgHeader } from "@/components/shared/BrandLogo";
import { Button } from "@/components/ui/Button";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";

interface ReceiptData {
  studentName: string;
  busNumber: string;
  grade?: string;
  month: string;
  monthlyFee: number;
  amountPaid: number;
  status: string;
  paidAt?: string;
  collectedBy: string;
  receiptNumber: string;
}

const formatIndianDate = (date?: string): string =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      })
    : "-";

const formatReceiptMonth = (month?: string): string =>
  month
    ? new Date(`${month}-01`).toLocaleDateString("en-IN", {
        month: "long",
        year: "numeric"
      })
    : "-";

const capitalizeStatus = (status?: string): string =>
  status ? status.charAt(0).toUpperCase() + status.slice(1).toLowerCase() : "-";

const ReceiptPage = (): JSX.Element => {
  const params = useParams<{ paymentId: string }>();

  const receiptQuery = useQuery({
    queryKey: ["receipt", params.paymentId],
    queryFn: async () =>
      (
        await api.post<{ data: ReceiptData }>(`/api/fees/receipt/${params.paymentId}`)
      ).data.data
  });

  const receipt = receiptQuery.data;
  const statusText = capitalizeStatus(receipt?.status);
  const statusClass =
    receipt?.status === "paid"
      ? "bg-emerald-100 text-emerald-700"
      : receipt?.status === "partial"
        ? "bg-yellow-100 text-yellow-700"
        : receipt?.status === "pending"
          ? "bg-orange-100 text-orange-700"
          : "bg-rose-100 text-rose-700";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-2xl flex-col items-center justify-center bg-gray-50 p-6 print:bg-white">
      <div className="w-full max-w-[520px] rounded-2xl border border-gray-200 bg-white p-8 text-gray-900 shadow-md print:border-0 print:shadow-none">
        <div className="mb-5 flex items-start justify-between gap-4">
          <ReceiptOrgHeader subtitle="Transport Fee Receipt" />
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">Receipt</p>
            <p className="text-sm font-semibold text-gray-700">{receipt?.receiptNumber ?? "-"}</p>
          </div>
        </div>
        <div className="mb-5 h-0.5 w-full bg-primary" />

        <div className="grid grid-cols-2 gap-y-3 text-sm">
          <p className="text-gray-500">Student Name</p>
          <p className="text-right font-medium text-gray-900">{receipt?.studentName ?? "-"}</p>

          <p className="text-gray-500">Bus</p>
          <p className="text-right font-medium text-gray-900">{receipt?.busNumber ?? "-"}</p>

          <p className="text-gray-500">Grade</p>
          <p className="text-right font-medium text-gray-900">{receipt?.grade ?? "-"}</p>

          <p className="text-gray-500">Month</p>
          <p className="text-right font-medium text-gray-900">{formatReceiptMonth(receipt?.month)}</p>

          <p className="text-gray-500">Amount Due</p>
          <p className="text-right font-medium text-gray-900">{formatINR(receipt?.monthlyFee ?? 0)}</p>

          <p className="text-gray-500">Amount Paid</p>
          <p className="text-right text-lg font-bold text-gray-900">{formatINR(receipt?.amountPaid ?? 0)}</p>

          <p className="text-gray-500">Status</p>
          <div className="text-right">
            <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass}`}>
              {statusText}
            </span>
          </div>

          <p className="text-gray-500">Payment Date</p>
          <p className="text-right font-medium text-gray-900">{formatIndianDate(receipt?.paidAt)}</p>

          <p className="text-gray-500">Collected By</p>
          <p className="text-right font-medium text-gray-900">{receipt?.collectedBy ?? "-"}</p>
        </div>

        <div className="-mx-8 -mb-8 mt-6 rounded-b-2xl bg-primary-50 px-8 py-4">
          <p className="text-center text-xs text-gray-600">
            Thank you for your payment. Please keep this receipt for records.
          </p>
        </div>
      </div>

      <Button className="no-print mt-4" onClick={() => window.print()}>
        Print
      </Button>
    </div>
  );
};

export default ReceiptPage;
