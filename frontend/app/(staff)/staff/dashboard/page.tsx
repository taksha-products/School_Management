"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { IndianRupee, Users } from "lucide-react";

import { useAcademicYear } from "@/hooks/useAcademicYear";
import { KpiStatCard } from "@/components/dashboard/KpiStatCard";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { canDo } from "@/lib/auth";
import { api } from "@/lib/api";
import { formatINR } from "@/lib/utils";
import type { DashboardSummary } from "@/types";
import type { OutstandingStudent } from "@/types/schoolFees";

const StaffDashboardPage = (): JSX.Element => {
  const orgAcademicYear = useAcademicYear();
  const month = new Date().toISOString().slice(0, 7);

  const summaryQuery = useQuery({
    queryKey: ["staff-summary", month],
    queryFn: async () =>
      (
        await api.get<{ data: DashboardSummary }>("/api/reports/summary", {
          params: { month, academicYear: orgAcademicYear }
        })
      ).data.data,
    enabled: canDo("canViewReports")
  });

  const outstandingQuery = useQuery({
    queryKey: ["staff-outstanding"],
    queryFn: async () =>
      (
        await api.get<{ data: OutstandingStudent[] }>("/api/school-fees/outstanding", {
          params: { academicYear: orgAcademicYear, page: 1, limit: 5 }
        })
      ).data.data,
    enabled: canDo("canCollectFees")
  });

  return (
    <PageWrapper title="Staff Dashboard" subtitle="Your daily overview">
      {canDo("canViewReports") && (
        <div className="grid gap-4 sm:grid-cols-2">
          <KpiStatCard
            label="Students"
            icon={Users}
            value={summaryQuery.data?.totalStudents ?? 0}
          />
          <KpiStatCard
            label="Fees collected"
            icon={IndianRupee}
            value={formatINR(summaryQuery.data?.totalFeesCollected ?? 0)}
          />
        </div>
      )}
      {canDo("canCollectFees") && (
        <Card>
          <div className="mb-3 flex items-center justify-between">
            <h3 className="font-semibold text-gray-900">Top outstanding (school fees)</h3>
            <Link href="/staff/school-fees" className="text-sm text-primary hover:underline">
              Collect fees
            </Link>
          </div>
          <ul className="space-y-2 text-sm">
            {(outstandingQuery.data ?? []).map((row) => (
              <li key={row.studentId} className="flex justify-between border-b border-gray-100 py-2">
                <span className="text-gray-700">
                  {row.studentName} · Grade {row.grade}
                </span>
                <span className="font-semibold text-red-600">{formatINR(row.balance)}</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </PageWrapper>
  );
};

export default StaffDashboardPage;
