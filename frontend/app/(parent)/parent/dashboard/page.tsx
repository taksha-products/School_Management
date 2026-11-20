"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";

const ParentDashboardPage = (): JSX.Element => {
  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async () =>
      (await api.get<{ data: Student[] }>("/api/parent/children")).data.data
  });

  const children = childrenQuery.data ?? [];

  if (children.length === 1) {
    return (
      <div>
        <p className="mb-4 text-sm text-slate-600">Fee summary for {children[0].name}</p>
        <Link href={`/parent/child/${children[0]._id}`}>
          <Card className="hover:border-amber-300">
            <p className="font-semibold">{children[0].name}</p>
            <p className="text-sm text-slate-500">Grade {children[0].grade}</p>
            <p className="mt-2 text-sm text-amber-600">View dues & payments →</p>
          </Card>
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-4 text-xl font-bold text-slate-900">My Children</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {children.map((child) => (
          <ChildBalanceCard key={child._id} child={child} />
        ))}
      </div>
    </div>
  );
};

const ChildBalanceCard = ({ child }: { child: Student }): JSX.Element => {
  const orgAcademicYear = useAcademicYear();
  const feesQuery = useQuery({
    queryKey: ["parent-child-fees", child._id],
    queryFn: async () =>
      (
        await api.get<{ data: { summary: { outstandingBalance: number } } }>(
          `/api/parent/children/${child._id}/fees`,
          { params: { academicYear: orgAcademicYear } }
        )
      ).data.data
  });

  const balance = feesQuery.data?.summary.outstandingBalance ?? 0;

  return (
    <Link href={`/parent/child/${child._id}`}>
      <Card className="transition hover:border-amber-400 hover:shadow-md">
        <p className="text-lg font-semibold">{child.name}</p>
        <p className="text-sm text-slate-500">Grade {child.grade}</p>
        <p
          className={`mt-3 text-xl font-bold ${balance > 0 ? "text-rose-600" : "text-emerald-600"}`}
        >
          {formatINR(balance)}
        </p>
        <p className="text-xs text-slate-500">Outstanding</p>
      </Card>
    </Link>
  );
};

export default ParentDashboardPage;
