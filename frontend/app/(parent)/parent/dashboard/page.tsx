"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowRight, BookOpen, Palette, PencilRuler, School } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useState, type JSX } from "react";

import { ParentBrandHeader } from "@/components/parent/ParentBrandHeader";
import { PastelDecor } from "@/components/parent/PastelDecor";
import { useAcademicYear } from "@/hooks/useAcademicYear";
import { bootstrapSession, getUser } from "@/lib/auth";
import { api } from "@/lib/api";
import { INK, pastelAt } from "@/lib/pastel";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";

const CARD_ICONS: LucideIcon[] = [BookOpen, PencilRuler, School, Palette];

const ParentDashboardPage = (): JSX.Element => {
  const [firstName, setFirstName] = useState("Parent");

  useEffect(() => {
    void bootstrapSession().then((user) => {
      const name = user?.name ?? getUser()?.name ?? "Parent";
      setFirstName(name.split(" ")[0] ?? "Parent");
    });
  }, []);

  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () =>
      (await api.get<{ data: Student[] }>("/api/parent/children")).data.data
  });

  const children = childrenQuery.data ?? [];

  return (
    <div>
      <ParentBrandHeader firstName={firstName} />

      {childrenQuery.isLoading ? (
        <p className="py-10 text-center text-sm text-[#71717A]">Loading children…</p>
      ) : children.length === 0 ? (
        <p className="py-10 text-center text-[15px] text-[#71717A]">
          No children linked to this account.
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {children.map((child, index) => (
            <ChildBalanceCard key={child._id} child={child} index={index} />
          ))}
        </div>
      )}
    </div>
  );
};

const ChildBalanceCard = ({ child, index }: { child: Student; index: number }): JSX.Element => {
  const orgAcademicYear = useAcademicYear();
  const pastel = pastelAt(index);
  const Icon = CARD_ICONS[index % CARD_ICONS.length]!;

  const feesQuery = useQuery({
    queryKey: ["parent-child-fees", child._id, orgAcademicYear],
    queryFn: async () =>
      (
        await api.get<{ data: { summary: { outstandingBalance: number } } }>(
          `/api/parent/children/${child._id}/fees`,
          { params: { academicYear: child.academicYear || orgAcademicYear } }
        )
      ).data.data
  });

  const due = feesQuery.data?.summary.outstandingBalance ?? 0;
  const amountLabel = feesQuery.isLoading
    ? "…"
    : feesQuery.isError
      ? "Fees unavailable"
      : due > 0
        ? `${formatINR(due)} due`
        : "All fees paid";

  return (
    <Link
      href={`/parent/child/${child._id}`}
      className="relative flex h-44 flex-col justify-end overflow-hidden rounded-[20px] p-[18px] transition hover:opacity-95 active:opacity-90"
      style={{ backgroundColor: pastel.bg }}
    >
      <PastelDecor pastel={pastel} icon={Icon} />

      <span className="absolute left-[18px] top-4 rounded-full bg-white/70 px-2.5 py-1 text-xs font-semibold text-[#3F3F46]">
        Grade {child.grade}
      </span>

      <div className="relative z-10 max-w-[62%]">
        <p className="truncate text-[19px] font-bold tracking-tight" style={{ color: INK }}>
          {child.name}
        </p>
        <p
          className="mt-0.5 text-[15px] font-bold"
          style={{ color: due > 0 ? "#DC2626" : "#2E7349" }}
        >
          {amountLabel}
        </p>
        <span className="mt-1 inline-flex items-center gap-1.5 text-[15px] text-[#52525B]">
          View fees
          <ArrowRight className="h-3.5 w-3.5" />
        </span>
      </div>
    </Link>
  );
};

export default ParentDashboardPage;
