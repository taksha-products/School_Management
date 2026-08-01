"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { Building2, IndianRupee, Users, Zap } from "lucide-react";

import { KpiStatCard } from "@/components/dashboard/KpiStatCard";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { api } from "@/lib/api";
import type { SuperDashboardResponse } from "@/types/superadmin";

const formatInr = (amount: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);

const SuperDashboardPage = (): JSX.Element => {
  const queryClient = useQueryClient();

  const dashboardQuery = useQuery({
    queryKey: ["super-dashboard"],
    queryFn: async () =>
      (await api.get<SuperDashboardResponse>("/api/superadmin/dashboard")).data.data
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/api/superadmin/organizations/${id}/status`, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["super-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["super-orgs"] });
    }
  });

  const stats = dashboardQuery.data?.stats;
  const orgs = dashboardQuery.data?.organizations ?? [];
  const isLoading = dashboardQuery.isLoading;

  return (
    <PageWrapper title="Super Admin Dashboard" subtitle="Platform-wide overview">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiStatCard
          label="Total organizations"
          icon={Building2}
          value={isLoading ? "—" : (stats?.totalOrganizations ?? 0)}
        />
        <KpiStatCard
          label="Total students"
          icon={Users}
          value={isLoading ? "—" : (stats?.totalStudents ?? 0)}
        />
        <KpiStatCard
          label="Active plans"
          icon={Zap}
          value={isLoading ? "—" : (stats?.activePlans ?? 0)}
        />
        <KpiStatCard
          label="Monthly revenue"
          icon={IndianRupee}
          value={isLoading ? "—" : formatInr(stats?.monthlyRevenue ?? 0)}
        />
      </div>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Organizations</h3>
          <Link href="/super/organizations" className="text-sm text-primary hover:underline">
            Manage all
          </Link>
        </div>
        {isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[600px] w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Plan</th>
                  <th>Students</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-sm text-gray-500">
                      No organizations found
                    </td>
                  </tr>
                ) : (
                  orgs.map((org, idx) => (
                    <tr key={org._id} className={idx % 2 === 1 ? "bg-gray-50" : undefined}>
                      <td className="font-medium text-gray-900">{org.name}</td>
                      <td className="capitalize">{org.plan}</td>
                      <td>{org.studentCount ?? 0}</td>
                      <td>{org.isActive ? "Active" : "Inactive"}</td>
                      <td>
                        <Button
                          variant="secondary"
                          className="px-2 py-1 text-xs"
                          onClick={() =>
                            toggleMutation.mutate({ id: org._id, isActive: !org.isActive })
                          }
                        >
                          {org.isActive ? "Deactivate" : "Activate"}
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageWrapper>
  );
};

export default SuperDashboardPage;
