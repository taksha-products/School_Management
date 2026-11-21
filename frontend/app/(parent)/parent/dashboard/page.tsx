"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Bus, ChevronRight, CreditCard } from "lucide-react";

import { useAcademicYear } from "@/hooks/useAcademicYear";
import { Card } from "@/components/ui/Card";
import { bootstrapSession, getUser } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { Student } from "@/types";
import { useEffect, useState, type JSX } from "react";

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
      <div className="mb-8 rounded-2xl border border-gray-200 bg-gradient-to-br from-primary-50 via-white to-white px-6 py-7">
        <p className="text-sm font-medium text-gray-500">Home</p>
        <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-gray-900">
          Hi, {firstName}
        </h1>
        <p className="mt-2 max-w-xl text-sm text-gray-600">
          Manage your children&apos;s fees, bus and more
        </p>
      </div>

      <div className="mb-4 flex items-end justify-between gap-3">
        <h2 className="text-xl font-extrabold tracking-tight text-gray-900">Your Children</h2>
        <p className="text-sm font-medium text-gray-500">
          {children.length} {children.length === 1 ? "Child" : "Children"}
        </p>
      </div>

      {childrenQuery.isLoading ? (
        <p className="text-sm text-gray-500">Loading children…</p>
      ) : children.length === 0 ? (
        <Card className="rounded-2xl">
          <p className="text-sm text-gray-500">No children linked to this account.</p>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {children.map((child) => (
            <ChildBalanceCard key={child._id} child={child} />
          ))}
        </div>
      )}
    </div>
  );
};

const ChildBalanceCard = ({ child }: { child: Student }): JSX.Element => {
  const orgAcademicYear = useAcademicYear();
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

  const balance = feesQuery.data?.summary.outstandingBalance ?? 0;
  const busLabel = child.transport?.busNumber
    ? `Bus ${child.transport.busNumber}`
    : "No bus";

  return (
    <Card className="rounded-2xl p-5 shadow-sm transition hover:border-primary/40 hover:shadow-md">
      <Link
        href={`/parent/child/${child._id}`}
        className="flex items-center gap-3"
      >
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-primary-50 text-xl font-bold text-primary">
          {child.name.slice(0, 1).toUpperCase()}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-lg font-bold text-gray-900">{child.name}</span>
          <span className="mt-0.5 block text-sm text-gray-500">Grade {child.grade}</span>
        </span>
        <ChevronRight className="h-5 w-5 text-gray-400" />
      </Link>

      <div className="my-4 h-px bg-gray-100" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-medium text-gray-600">Outstanding</p>
          <p
            className={`mt-0.5 text-2xl font-extrabold tracking-tight ${
              balance > 0 ? "text-rose-600" : "text-emerald-600"
            }`}
          >
            {feesQuery.isLoading ? "—" : formatINR(balance)}
          </p>
        </div>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary-50 px-3 py-1.5 text-sm font-semibold text-primary">
          <Bus className="h-4 w-4" />
          {busLabel}
        </span>
      </div>

      <Link
        href={`/parent/child/${child._id}`}
        className="mt-4 flex h-12 items-center justify-center gap-2 rounded-xl bg-primary text-sm font-bold text-white transition hover:opacity-90"
      >
        <CreditCard className="h-4 w-4" />
        View fees &amp; pay
      </Link>
    </Card>
  );
};

export default ParentDashboardPage;
