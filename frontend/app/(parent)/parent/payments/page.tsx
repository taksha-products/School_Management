"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { SchoolFeePayment } from "@/types/schoolFees";

const ParentPaymentsPage = (): JSX.Element => {
  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () =>
      (await api.get<{ data: { _id: string; name: string }[] }>("/api/parent/children")).data.data
  });

  const childIds = (childrenQuery.data ?? []).map((c) => c._id);

  const paymentsQueries = useQuery({
    queryKey: ["parent-all-payments", childIds],
    queryFn: async () => {
      const all: SchoolFeePayment[] = [];
      for (const id of childIds) {
        const res = await api.get<{ data: SchoolFeePayment[] }>(
          `/api/parent/children/${id}/payments`
        );
        all.push(...res.data.data);
      }
      return all.sort(
        (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      );
    },
    enabled: childIds.length > 0
  });

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold">Payment History</h1>
      <Card>
        <ul className="divide-y text-sm">
          {(paymentsQueries.data ?? []).map((p) => (
            <li key={p._id} className="flex justify-between py-3">
              <div>
                <p className="font-medium">{p.receiptNumber}</p>
                <p className="text-slate-500">
                  {new Date(p.paymentDate).toLocaleDateString("en-IN")}
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
    </div>
  );
};

export default ParentPaymentsPage;
