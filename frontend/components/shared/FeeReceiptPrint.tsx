"use client";

import { Bus } from "lucide-react";
import type { JSX } from "react";

import { Button } from "@/components/ui/Button";
import { formatINR } from "@/lib/utils";
import type { SchoolFeeReceipt } from "@/types/schoolFees";

interface FeeReceiptPrintProps {
  receipt: SchoolFeeReceipt;
  title?: string;
  showPrintButton?: boolean;
}

const formatDate = (date?: string): string =>
  date
    ? new Date(date).toLocaleDateString("en-IN", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric"
      })
    : "-";

export const FeeReceiptPrint = ({
  receipt,
  title = "School Fee Receipt",
  showPrintButton = true
}: FeeReceiptPrintProps): JSX.Element => {
  return (
    <div className="flex min-h-screen flex-col items-center bg-gray-50 p-6 print:bg-white">
      <div className="w-full max-w-[520px] rounded-2xl border border-gray-200 bg-white p-8 text-gray-900 shadow-md print:border-0 print:shadow-none">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary">
              <Bus className="h-4 w-4 text-white" strokeWidth={2.5} />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900">BusTrack</h1>
              <p className="text-xs text-gray-500">{title}</p>
            </div>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-400">
              Receipt
            </p>
            <p className="text-sm font-semibold text-gray-700">{receipt.receiptNumber}</p>
          </div>
        </div>
        <div className="mb-5 h-0.5 w-full bg-primary" />

        <div className="mb-4 grid grid-cols-2 gap-y-2 text-sm">
          <p className="text-gray-500">Student</p>
          <p className="text-right font-medium text-gray-900">{receipt.studentName}</p>
          <p className="text-gray-500">Grade</p>
          <p className="text-right font-medium text-gray-900">{receipt.grade}</p>
          {receipt.parentName && (
            <>
              <p className="text-gray-500">Parent</p>
              <p className="text-right font-medium text-gray-900">{receipt.parentName}</p>
            </>
          )}
          <p className="text-gray-500">Payment Date</p>
          <p className="text-right font-medium text-gray-900">{formatDate(receipt.paymentDate)}</p>
          <p className="text-gray-500">Payment Mode</p>
          <p className="text-right font-medium capitalize text-gray-900">
            {receipt.paymentMode}
          </p>
          {receipt.upiTransactionId && (
            <>
              <p className="text-gray-500">Transaction ID</p>
              <p className="text-right font-medium text-gray-900">{receipt.upiTransactionId}</p>
            </>
          )}
        </div>

        <table className="mb-4 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 text-left text-gray-500">
              <th className="py-2">Fee Head</th>
              <th className="py-2">Period</th>
              <th className="py-2 text-right">Paid</th>
            </tr>
          </thead>
          <tbody>
            {receipt.feeHeadPayments.map((line) => (
              <tr key={`${line.feeHeadName}-${line.periodLabel}`} className="border-b border-gray-100">
                <td className="py-2 text-gray-900">{line.feeHeadName}</td>
                <td className="py-2 text-gray-700">{line.periodLabel}</td>
                <td className="py-2 text-right font-medium text-gray-900">
                  {formatINR(line.amountPaid)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="flex justify-between border-t border-gray-200 pt-3 text-sm font-semibold text-gray-900">
          <span>Total Paid</span>
          <span className="text-lg">{formatINR(receipt.totalAmountPaid)}</span>
        </div>
        {receipt.collectedBy && (
          <p className="mt-2 text-sm text-gray-500">Collected by: {receipt.collectedBy}</p>
        )}
        {receipt.notes && <p className="mt-1 text-xs text-gray-500">Note: {receipt.notes}</p>}

        <div className="-mx-8 -mb-8 mt-6 rounded-b-2xl bg-primary-50 px-8 py-4 print:rounded-none">
          <p className="text-center text-xs text-gray-600">
            Thank you for your payment. Please keep this receipt for your records.
          </p>
        </div>
      </div>
      {showPrintButton && (
        <Button className="no-print mt-4" onClick={() => window.print()}>
          Print
        </Button>
      )}
    </div>
  );
};
