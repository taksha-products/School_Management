"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type JSX } from "react";
import { ArrowLeft, Bus, Navigation } from "lucide-react";

import { useAcademicYear } from "@/hooks/useAcademicYear";
import { ReceiptDownload } from "@/components/payments/ReceiptDownload";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { useToast } from "@/components/ui/Toast";
import { useOrgTheme } from "@/hooks/useOrgTheme";
import { useRazorpay, type RazorpayResponse } from "@/hooks/useRazorpay";
import { api } from "@/lib/api";
import { getUser } from "@/lib/auth";
import {
  createPaymentOrder,
  createSchoolPaymentIntent,
  verifyPayment
} from "@/lib/payments";
import { cn, formatINR } from "@/lib/utils";
import type { Student } from "@/types";
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

type Tab = "dues" | "history" | "transport";

const statusLabel = (status: string): string => {
  switch (status) {
    case "paid":
      return "Paid";
    case "partial":
      return "Partial";
    case "overdue":
      return "Overdue";
    default:
      return "Due";
  }
};

const ChildFeesPage = (): JSX.Element => {
  const orgAcademicYear = useAcademicYear();
  const params = useParams<{ studentId: string }>();
  const queryClient = useQueryClient();
  const { showToast } = useToast();
  const { isLoaded, openCheckout } = useRazorpay();
  const { displayLabel, brandColor } = useOrgTheme();
  const [tab, setTab] = useState<Tab>("dues");
  const [payingKey, setPayingKey] = useState<string | null>(null);
  const [lastReceipt, setLastReceipt] = useState<string | null>(null);

  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () =>
      (await api.get<{ data: Student[] }>("/api/parent/children")).data.data
  });

  const child = (childrenQuery.data ?? []).find((c) => c._id === params.studentId);
  const academicYear = child?.academicYear || orgAcademicYear;

  const ledgerQuery = useQuery({
    queryKey: ["parent-child-ledger", params.studentId, academicYear],
    queryFn: async () =>
      (
        await api.get<{ data: StudentFeeLedgerView }>(
          `/api/parent/children/${params.studentId}/fees`,
          { params: { academicYear } }
        )
      ).data.data,
    enabled: !!params.studentId
  });

  const paymentsQuery = useQuery({
    queryKey: ["parent-child-payments", params.studentId, academicYear],
    queryFn: async () =>
      (
        await api.get<{ data: StudentFeeLedgerView["paymentHistory"] }>(
          `/api/parent/children/${params.studentId}/payments`,
          { params: { academicYear } }
        )
      ).data.data,
    enabled: tab === "history"
  });

  const ledger = ledgerQuery.data;
  const transport = child?.transport ?? null;
  const user = getUser();

  const dues: DueItem[] =
    ledger?.feeHeads.flatMap((h) =>
      h.periods
        .filter((p) => p.balance > 0)
        .map((p) => ({
          feeHeadName: h.feeHeadName,
          periodLabel: p.periodLabel,
          displayLabel: p.displayLabel,
          amountDue: p.amountDue,
          balance: p.balance,
          dueDate: p.dueDate,
          status: p.status
        }))
    ) ?? [];

  const handlePayNow = async (item: DueItem): Promise<void> => {
    const key = `${item.feeHeadName}-${item.displayLabel}`;
    setPayingKey(key);
    setLastReceipt(null);
    try {
      const intent = await createSchoolPaymentIntent(
        params.studentId,
        academicYear,
        [
          {
            feeHeadName: item.feeHeadName,
            periodLabel: item.periodLabel,
            amountPaid: item.balance
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
        name: displayLabel,
        description: intent.description,
        theme: { color: brandColor },
        prefill: {
          name: user?.name,
          email: user?.email,
          contact: ledger?.student.parentPhone || user?.phone
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
            queryClient.invalidateQueries({ queryKey: ["parent-child-fees"] });
            queryClient.invalidateQueries({ queryKey: ["parent-all-payments"] });
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

  const tabs: Array<{ id: Tab; label: string }> = [
    { id: "dues", label: "Dues" },
    { id: "history", label: "History" },
    { id: "transport", label: "Bus" }
  ];

  return (
    <div>
      <Link
        href="/parent/dashboard"
        className="mb-4 inline-flex items-center gap-1.5 text-sm font-medium text-gray-500 hover:text-primary"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to children
      </Link>

      <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">
        {ledger?.student.name ?? child?.name ?? "Student"}
      </h1>
      <p className="mt-1 text-sm text-gray-500">
        Grade {ledger?.student.grade ?? child?.grade ?? "—"}
      </p>

      <Card className="mt-5 rounded-2xl border-primary/15 bg-primary-50/50 p-5">
        <p className="text-xs font-medium text-gray-500">Outstanding balance</p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight text-rose-600">
          {formatINR(ledger?.summary.outstandingBalance ?? 0)}
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
          <span>Paid {formatINR(ledger?.summary.totalPaid ?? 0)}</span>
          <span>Overdue {formatINR(ledger?.summary.overdueAmount ?? 0)}</span>
        </div>
      </Card>

      {lastReceipt && (
        <div className="mt-4 flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
          <span className="text-sm font-medium text-emerald-800">Payment successful!</span>
          <Link
            href={`/parent/receipt/${lastReceipt}`}
            className="text-sm font-semibold text-emerald-700 underline"
          >
            View receipt {lastReceipt}
          </Link>
          <ReceiptDownload feeType="school" receiptNumber={lastReceipt} />
        </div>
      )}

      <div className="mt-5 mb-4 flex gap-2">
        {tabs.map((t) => (
          <button
            key={t.id}
            type="button"
            className={cn(
              "rounded-full px-4 py-2 text-sm font-bold transition",
              tab === t.id
                ? "bg-primary text-white"
                : "border border-gray-200 bg-white text-gray-600 hover:text-primary"
            )}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "dues" ? (
        <div className="space-y-3">
          {dues.length === 0 ? (
            <Card className="rounded-2xl">
              <p className="text-sm text-gray-500">No outstanding dues. You&apos;re all clear.</p>
            </Card>
          ) : (
            dues.map((item) => {
              const key = `${item.feeHeadName}-${item.displayLabel}`;
              const isPaying = payingKey === key;
              return (
                <Card key={key} className="rounded-2xl p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-gray-900">{item.feeHeadName}</p>
                      <p className="mt-0.5 text-sm text-gray-500">{item.displayLabel}</p>
                      {item.dueDate ? (
                        <p className="mt-1 text-xs text-gray-400">
                          Due {new Date(item.dueDate).toLocaleDateString("en-IN")}
                        </p>
                      ) : null}
                    </div>
                    <Badge
                      status={
                        item.status === "overdue"
                          ? "overdue"
                          : item.status === "partial"
                            ? "partial"
                            : "pending"
                      }
                    >
                      {statusLabel(item.status)}
                    </Badge>
                  </div>
                  <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                    <p className="text-xl font-extrabold text-gray-900">
                      {formatINR(item.balance)}
                    </p>
                    <Button disabled={isPaying} onClick={() => void handlePayNow(item)}>
                      {isPaying ? "…" : "Pay now"}
                    </Button>
                  </div>
                </Card>
              );
            })
          )}
        </div>
      ) : null}

      {tab === "history" ? (
        <Card className="rounded-2xl p-0" flush>
          {(paymentsQuery.data ?? []).length === 0 ? (
            <p className="p-5 text-sm text-gray-500">No payments yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {(paymentsQuery.data ?? []).map((p) => (
                <li key={p._id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                  <div>
                    <p className="font-bold text-gray-900">{p.receiptNumber}</p>
                    <p className="text-gray-500">
                      {new Date(p.paymentDate).toLocaleDateString("en-IN")} · {p.paymentMode}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-extrabold text-emerald-600">
                      {formatINR(p.totalAmountPaid)}
                    </p>
                    <Link
                      href={`/parent/receipt/${p.receiptNumber}`}
                      className="text-primary hover:underline"
                    >
                      View Receipt
                    </Link>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      ) : null}

      {tab === "transport" ? (
        <Card className="rounded-2xl p-5">
          {transport?.busNumber ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Bus className="h-5 w-5 text-primary" />
                <p className="text-lg font-extrabold text-gray-900">Bus {transport.busNumber}</p>
              </div>
              <div className="grid gap-2 text-sm sm:grid-cols-2">
                <div>
                  <p className="text-gray-500">Route</p>
                  <p className="font-semibold text-gray-900">{transport.routeName || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Pickup</p>
                  <p className="font-semibold text-gray-900">{transport.pickupStop || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Drop</p>
                  <p className="font-semibold text-gray-900">{transport.dropStop || "—"}</p>
                </div>
                <div>
                  <p className="text-gray-500">Monthly fee</p>
                  <p className="font-semibold text-gray-900">
                    {formatINR(transport.monthlyTransportFee ?? 0)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-gray-100 pt-3">
                <Navigation className="h-4 w-4 text-gray-400" />
                <span className="flex-1 text-sm text-gray-500">
                  Live GPS tracking will appear here when enabled by your school.
                </span>
                <Badge status="pending">Coming soon</Badge>
              </div>
            </div>
          ) : (
            <p className="text-sm text-gray-500">No bus assigned for this child.</p>
          )}
        </Card>
      ) : null}
    </div>
  );
};

export default ChildFeesPage;
