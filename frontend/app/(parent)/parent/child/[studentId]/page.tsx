"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

import { ReceiptDownload } from "@/components/payments/ReceiptDownload";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useRazorpay, type RazorpayResponse } from "@/hooks/useRazorpay";
import { ACADEMIC_YEAR } from "@/lib/constants";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import {
  createPaymentOrder,
  createSchoolPaymentIntent,
  verifyPayment
} from "@/lib/payments";
import { formatINR } from "@/lib/utils";
import type { StudentFeeLedgerView } from "@/types/schoolFees";

interface DueItem {
  feeHeadName: string;
  periodLabel: string;
  displayLabel: string;
  amountDue: number;
  balance: number;
  dueDate?: string;
  status: string;
}

const ChildFeesPage = (): JSX.Element => {
  const params = useParams<{ studentId: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { isLoaded, openCheckout } = useRazorpay();
  const [tab, setTab] = useState<"dues" | "history">("dues");
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);

  const ledgerQuery = useQuery({
    queryKey: ["parent-child-ledger", params.studentId],
    queryFn: async () =>
      (
        await api.get<{ data: StudentFeeLedgerView }>(
          `/api/parent/children/${params.studentId}/fees`,
          { params: { academicYear: ACADEMIC_YEAR } }
        )
      ).data.data
  });

  const paymentsQuery = useQuery({
    queryKey: ["parent-child-payments", params.studentId],
    queryFn: async () =>
      (
        await api.get<{ data: StudentFeeLedgerView["paymentHistory"] }>(
          `/api/parent/children/${params.studentId}/payments`,
          { params: { academicYear: ACADEMIC_YEAR } }
        )
      ).data.data,
    enabled: tab === "history"
  });

  const ledger = ledgerQuery.data;
  const user = getUser();
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0);

  const allPeriods: DueItem[] =
    ledger?.feeHeads.flatMap((h) =>
      h.periods.map((p) => ({
        feeHeadName: h.feeHeadName,
        periodLabel: p.periodLabel,
        displayLabel: p.displayLabel,
        amountDue: p.amountDue,
        balance: p.balance,
        dueDate: p.dueDate,
        status: p.status
      }))
    ) ?? [];

  const overdue = allPeriods.filter((p) => p.status === "overdue");
  const thisMonth = allPeriods.filter((p) => {
    if (!p.dueDate) return false;
    const d = new Date(p.dueDate);
    return d >= monthStart && d <= monthEnd && ["pending", "partial"].includes(p.status);
  });
  const upcoming = allPeriods.filter((p) => {
    if (!p.dueDate) return false;
    return new Date(p.dueDate) > monthEnd && ["pending", "partial"].includes(p.status);
  });

  const handlePayNow = async (item: DueItem): Promise<void> => {
    const key = `${item.feeHeadName}-${item.displayLabel}`;
    setPayingKey(key);
    setLastReceipt(null);
    try {
      const lateFee = item.status === "overdue" ? Math.round(item.balance * 0.02) : 0;
      const intent = await createSchoolPaymentIntent(
        params.studentId,
        ACADEMIC_YEAR,
        [
          {
            feeHeadName: item.feeHeadName,
            periodLabel: item.periodLabel,
            amountPaid: item.balance,
            lateFee
          }
        ],
        { parent: true }
      );

      if (!isLoaded) {
        showToast("error", "Payment system is still loading. Please try again.");
        return;
      }

      const order = await createPaymentOrder("school", intent.feePaymentId, intent.amount);

      openCheckout({
        key: order.keyId,
        amount: order.amount,
        currency: order.currency,
        order_id: order.orderId,
        name: "BusTrack",
        description: intent.description,
        theme: { color: "#ea580c" },
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: ledger?.student.parentPhone
        },
        handler: async (response: RazorpayResponse) => {
          try {
            const verified = await verifyPayment({
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
              feeType: "school",
              feePaymentId: intent.feePaymentId
            });
            setLastReceipt(verified.receiptNumber);
            showToast("success", "Payment successful!");
            queryClient.invalidateQueries({ queryKey: ["parent-child-ledger"] });
            queryClient.invalidateQueries({ queryKey: ["parent-child-payments"] });
          } catch {
            showToast("error", "Payment verification failed, contact school");
          }
        },
        modal: {
          ondismiss: () => setPayingKey(null)
        }
      });
    } catch {
      showToast("error", "Could not initiate payment, please try again");
    } finally {
      setPayingKey(null);
    }
  };

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold">{ledger?.student.name ?? "Student"}</h1>
      <p className="mb-4 text-slate-600">Grade {ledger?.student.grade}</p>
      <p className="mb-6 text-2xl font-bold text-rose-600">
        Outstanding: {formatINR(ledger?.summary.outstandingBalance ?? 0)}
      </p>

      {lastReceipt && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-sm text-emerald-800">Payment successful!</span>
          <ReceiptDownload feeType="school" receiptNumber={lastReceipt} />
        </div>
      )}

      <div className="mb-4 flex gap-2">
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "dues" ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600 hover:text-primary"}`}
          onClick={() => setTab("dues")}
        >
          Outstanding Dues
        </button>
        <button
          type="button"
          className={`rounded-lg px-4 py-2 text-sm font-medium ${tab === "history" ? "bg-primary text-white" : "border border-gray-200 bg-white text-gray-600 hover:text-primary"}`}
          onClick={() => setTab("history")}
        >
          Payment History
        </button>
      </div>

      {tab === "dues" ? (
        <div className="space-y-6">
          <DueGroup
            title="Overdue"
            color="red"
            items={overdue}
            payingKey={payingKey}
            onPayNow={handlePayNow}
          />
          <DueGroup
            title="Due this month"
            color="orange"
            items={thisMonth}
            payingKey={payingKey}
            onPayNow={handlePayNow}
          />
          <DueGroup
            title="Upcoming"
            color="grey"
            items={upcoming}
            payingKey={payingKey}
            onPayNow={handlePayNow}
          />
        </div>
      ) : (
        <Card>
          <ul className="divide-y text-sm">
            {(paymentsQuery.data ?? []).map((p) => (
              <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                <div>
                  <p className="font-medium">{p.receiptNumber}</p>
                  <p className="text-slate-500">
                    {new Date(p.paymentDate).toLocaleDateString("en-IN")} · {p.paymentMode}
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold">{formatINR(p.totalAmountPaid)}</p>
                  <Link
                    href={`/parent/receipt/${p.receiptNumber}`}
                    className="text-amber-600 hover:underline"
                  >
                    View Receipt
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
};

const DueGroup = ({
  title,
  color,
  items,
  payingKey,
  onPayNow
}: {
  title: string;
  color: "red" | "orange" | "grey";
  items: DueItem[];
  payingKey: string | null;
  onPayNow: (item: DueItem) => void;
}): JSX.Element | null => {
  if (!items.length) return null;
  const border =
    color === "red" ? "border-rose-200" : color === "orange" ? "border-orange-200" : "border-slate-200";
  const canPay = (status: string): boolean =>
    status === "pending" || status === "partial" || status === "overdue";

  return (
    <Card className={border}>
      <h3 className="mb-3 font-semibold">{title}</h3>
      <div className="space-y-2 text-sm">
        {items.map((item) => {
          const key = `${item.feeHeadName}-${item.displayLabel}`;
          const isPaying = payingKey === key;
          return (
            <div
              key={key}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 py-2 last:border-0"
            >
              <span>
                {item.feeHeadName} · {item.displayLabel}
              </span>
              <span className="flex items-center gap-2">
                {formatINR(item.balance)}
                <Badge status={item.status as "paid" | "partial" | "pending" | "overdue"} />
                {canPay(item.status) && (
                  <Button
                    variant="secondary"
                    disabled={isPaying}
                    onClick={() => onPayNow(item)}
                  >
                    {isPaying ? "..." : "Pay Now"}
                  </Button>
                )}
              </span>
            </div>
          );
        })}
      </div>
    </Card>
  );
};

export default ChildFeesPage;
