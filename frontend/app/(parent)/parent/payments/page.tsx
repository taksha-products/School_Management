"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight, BookOpen, Palette, PencilRuler, School } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useMemo, type JSX } from "react";

import { ParentBrandHeader } from "@/components/parent/ParentBrandHeader";
import { PastelDecor } from "@/components/parent/PastelDecor";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { api } from "@/lib/api";
import { INK, pastelAt, SOFT_TEXT, SUCCESS_GREEN, TILE } from "@/lib/pastel";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";
import type { SchoolFeePayment } from "@/types/schoolFees";

const CARD_ICONS: LucideIcon[] = [BookOpen, PencilRuler, School, Palette];

interface PaymentWithChild extends SchoolFeePayment {
  childName: string;
  childId: string;
  childIndex: number;
}

const ParentPaymentsPage = (): JSX.Element => {
  const orgAcademicYear = useAcademicYear();

  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () =>
      (await api.get<{ data: Student[] }>("/api/parent/children")).data.data
  });

  const children = childrenQuery.data ?? [];
  const childIds = children.map((c) => c._id);

  const duesQuery = useQuery({
    queryKey: ["parent-payments-dues", childIds, orgAcademicYear],
    queryFn: async () => {
      const rows = await Promise.all(
        children.map(async (child) => {
          try {
            const res = await api.get<{ data: { summary: { outstandingBalance: number } } }>(
              `/api/parent/children/${child._id}/fees`,
              { params: { academicYear: child.academicYear || orgAcademicYear } }
            );
            return { id: child._id, outstanding: res.data.data.summary.outstandingBalance };
          } catch {
            return { id: child._id, outstanding: 0 };
          }
        })
      );
      return Object.fromEntries(rows.map((row) => [row.id, row.outstanding]));
    },
    enabled: childIds.length > 0
  });

  const paymentsQuery = useQuery({
    queryKey: ["parent-all-payments", childIds],
    queryFn: async () => {
      const all: PaymentWithChild[] = [];
      for (const [index, child] of children.entries()) {
        const res = await api.get<{ data: SchoolFeePayment[] }>(
          `/api/parent/children/${child._id}/payments`
        );
        for (const payment of res.data.data) {
          all.push({
            ...payment,
            childName: child.name,
            childId: child._id,
            childIndex: index
          });
        }
      }
      return all.sort(
        (a, b) => new Date(b.paymentDate).getTime() - new Date(a.paymentDate).getTime()
      );
    },
    enabled: childIds.length > 0
  });

  const duesMap = duesQuery.data ?? {};
  const totalDue = useMemo(
    () => Object.values(duesMap).reduce((sum, value) => sum + value, 0),
    [duesMap]
  );
  const receipts = paymentsQuery.data ?? [];
  const totalPaid = useMemo(
    () => receipts.reduce((sum, row) => sum + (row.totalAmountPaid || 0), 0),
    [receipts]
  );

  const receiptGroups = useMemo(() => {
    const map = new Map<string, PaymentWithChild[]>();
    for (const row of receipts) {
      const date = new Date(row.paymentDate);
      const key = Number.isNaN(date.getTime())
        ? "Earlier"
        : date.toLocaleDateString("en-IN", { month: "long", year: "numeric" });
      const list = map.get(key) ?? [];
      list.push(row);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [receipts]);

  return (
    <div>
      <ParentBrandHeader title="Payments" tagline="Pay fees and view receipts" />

      <div className="mb-5 flex gap-2.5 md:gap-4">
        <div className="flex-1 rounded-[20px] bg-[#F4F5F6] p-4 md:border md:border-gray-200 md:bg-white md:p-5 md:shadow-sm">
          <p className="text-[13px]" style={{ color: SOFT_TEXT }}>
            Total due
          </p>
          <p
            className="mt-1 text-[22px] font-extrabold tracking-tight"
            style={{ color: totalDue > 0 ? "#DC2626" : SUCCESS_GREEN }}
          >
            {duesQuery.isLoading ? "…" : formatINR(totalDue)}
          </p>
        </div>
        <div className="flex-1 rounded-[20px] bg-[#F4F5F6] p-4 md:border md:border-gray-200 md:bg-white md:p-5 md:shadow-sm">
          <p className="text-[13px]" style={{ color: SOFT_TEXT }}>
            Total paid
          </p>
          <p className="mt-1 text-[22px] font-extrabold tracking-tight" style={{ color: SUCCESS_GREEN }}>
            {paymentsQuery.isLoading ? "…" : formatINR(totalPaid)}
          </p>
        </div>
      </div>

      <h2 className="mb-3 text-[19px] font-bold tracking-tight" style={{ color: INK }}>
        Pay school fees
      </h2>

      {childrenQuery.isLoading ? (
        <p className="mb-6 text-sm text-[#71717A]">Loading…</p>
      ) : children.length === 0 ? (
        <p className="mb-6 text-sm text-[#71717A]">No children found.</p>
      ) : (
        <div className="mb-6 flex flex-col gap-3 md:grid md:grid-cols-2 md:gap-4">
          {children.map((child, index) => {
            const pastel = pastelAt(index);
            const Icon = CARD_ICONS[index % CARD_ICONS.length]!;
            const due = duesMap[child._id] ?? 0;
            return (
              <Link
                key={child._id}
                href={`/parent/child/${child._id}`}
                className="relative flex h-[150px] flex-col justify-end overflow-hidden rounded-[20px] p-[18px] transition hover:opacity-95 md:h-44 md:shadow-sm md:hover:shadow-md"
                style={{ backgroundColor: pastel.bg }}
              >
                <PastelDecor pastel={pastel} icon={Icon} />
                <div className="relative z-10 max-w-[62%]">
                  <p className="text-[19px] font-bold tracking-tight" style={{ color: INK }}>
                    Pay for {child.name.split(" ")[0]}
                  </p>
                  <p
                    className="mt-0.5 text-[15px] font-bold"
                    style={{ color: due > 0 ? "#DC2626" : "#2E7349" }}
                  >
                    {duesQuery.isLoading
                      ? "…"
                      : due > 0
                        ? `${formatINR(due)} due`
                        : "All fees paid"}
                  </p>
                  <span className="mt-1 inline-flex items-center gap-1.5 text-[15px] text-[#52525B]">
                    Open fees
                    <ArrowRight className="h-3.5 w-3.5" />
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}

      <div className="mb-3 flex items-center gap-2">
        <h2 className="text-[19px] font-bold tracking-tight" style={{ color: INK }}>
          Receipts
        </h2>
        {receipts.length > 0 ? (
          <span
            className="rounded-full px-2.5 py-0.5 text-xs font-bold text-white"
            style={{ backgroundColor: SUCCESS_GREEN }}
          >
            {receipts.length}
          </span>
        ) : null}
      </div>

      {paymentsQuery.isLoading ? (
        <p className="text-sm text-[#71717A]">Loading payments…</p>
      ) : receipts.length === 0 ? (
        <div className="rounded-[20px] p-5" style={{ backgroundColor: TILE }}>
          <p className="text-sm text-[#71717A]">
            No payments yet. Pay a due from a child&apos;s fee page.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {receiptGroups.map(([month, rows]) => (
            <div key={month}>
              <p className="mb-2 text-sm font-semibold" style={{ color: SOFT_TEXT }}>
                {month}
              </p>
              <ul className="flex flex-col gap-2.5">
                {rows.map((row) => {
                  const pastel = pastelAt(row.childIndex);
                  return (
                    <li key={`${row._id}-${row.receiptNumber}`}>
                      <Link
                        href={`/parent/receipt/${row.receiptNumber}`}
                        className="flex items-center gap-3 rounded-[20px] p-3.5 transition hover:opacity-95"
                        style={{ backgroundColor: TILE }}
                      >
                        <span
                          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-extrabold"
                          style={{ backgroundColor: pastel.bg, color: pastel.accent }}
                        >
                          {row.childName.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate font-semibold text-[#141414]">
                            {row.childName}
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-[#71717A]">
                            {row.receiptNumber}
                          </span>
                        </span>
                        <span className="text-[15px] font-extrabold" style={{ color: SUCCESS_GREEN }}>
                          {formatINR(row.totalAmountPaid)}
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ParentPaymentsPage;
