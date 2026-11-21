"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronRight, Receipt } from "lucide-react";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";
import type { SchoolFeePayment } from "@/types/schoolFees";
import type { JSX } from "react";

interface PaymentWithChild extends SchoolFeePayment {
  childName: string;
  childId: string;
}

const ParentPaymentsPage = (): JSX.Element => {
  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () =>
      (await api.get<{ data: Student[] }>("/api/parent/children")).data.data
  });

  const children = childrenQuery.data ?? [];
  const childIds = children.map((c) => c._id);

  const paymentsQuery = useQuery({
    queryKey: ["parent-all-payments", childIds],
    queryFn: async () => {
      const all: PaymentWithChild[] = [];
      for (const child of children) {
        const res = await api.get<{ data: SchoolFeePayment[] }>(
          `/api/parent/children/${child._id}/payments`
        );
        for (const payment of res.data.data) {
          all.push({
            ...payment,
            childName: child.name,
            childId: child._id
          });
        }
      }
      return all.sort(
        (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      );
    },
    enabled: childIds.length > 0
  });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-extrabold tracking-tight text-gray-900">Payments</h1>
        <p className="mt-1 text-sm text-gray-500">History and quick pay</p>
      </div>

      <Card className="mb-6 rounded-2xl border-primary/20 bg-primary-50/60">
        <h2 className="text-base font-extrabold text-gray-900">Pay school fees</h2>
        <p className="mt-1 text-sm text-gray-600">
          Open a child to pay outstanding dues online.
        </p>
        {children.length === 0 ? (
          <p className="mt-3 text-sm text-gray-500">No children found.</p>
        ) : (
          <div className="mt-4 flex flex-wrap gap-2">
            {children.map((child) => (
              <Link key={child._id} href={`/parent/child/${child._id}`}>
                <Button>Pay for {child.name.split(" ")[0]}</Button>
              </Link>
            ))}
          </div>
        )}
      </Card>

      <h2 className="mb-3 text-base font-extrabold text-gray-900">Recent payments</h2>

      {paymentsQuery.isLoading ? (
        <p className="text-sm text-gray-500">Loading payments…</p>
      ) : (paymentsQuery.data ?? []).length === 0 ? (
        <Card className="rounded-2xl">
          <p className="text-sm text-gray-500">
            No payments yet. Pay a due from a child&apos;s fee page.
          </p>
        </Card>
      ) : (
        <ul className="space-y-3">
          {(paymentsQuery.data ?? []).map((p) => (
            <li key={`${p._id}-${p.receiptNumber}`}>
              <Link href={`/parent/receipt/${p.receiptNumber}`}>
                <Card className="flex items-center gap-3 rounded-2xl p-4 transition hover:border-primary/40 hover:shadow-sm">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-50 text-primary">
                    <Receipt className="h-4 w-4" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-gray-900">{p.receiptNumber}</span>
                    <span className="mt-0.5 block text-sm text-gray-500">{p.childName}</span>
                    <span className="mt-0.5 block text-xs text-gray-400">
                      {new Date(p.paymentDate).toLocaleDateString("en-IN")} ·{" "}
                      {p.paymentMode || "online"}
                    </span>
                  </span>
                  <span className="flex items-center gap-1 text-right">
                    <span className="font-extrabold text-emerald-600">
                      {formatINR(p.totalAmountPaid)}
                    </span>
                    <ChevronRight className="h-4 w-4 text-gray-400" />
                  </span>
                </Card>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default ParentPaymentsPage;
