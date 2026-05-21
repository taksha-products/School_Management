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
import type { Organization } from "@/types/schoolFees";

const SuperDashboardPage = (): JSX.Element => {
  const queryClient = useQueryClient();

  const orgsQuery = useQuery({
    queryKey: ["super-orgs-dashboard"],
    queryFn: async () =>
      (
        await api.get<{ data: Organization[]; pagination?: { total: number } }>(
          "/api/superadmin/organizations",
          { params: { page: 1, limit: 100 } }
        )
      ).data
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/api/superadmin/organizations/${id}/status`, { isActive }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["super-orgs"] })
  });

  const orgs = orgsQuery.data?.data ?? [];
  const orgTotal = orgsQuery.data?.pagination?.total ?? orgs.length;
  const totalStudents = orgs.reduce((s, o) => s + (o.studentCount ?? 0), 0);
  const activePlans = orgs.filter((o) => o.isActive).length;

  return (
    <PageWrapper title="Super Admin Dashboard" subtitle="Platform-wide overview">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <KpiStatCard label="Total organizations" icon={Building2} value={orgTotal} />
        <KpiStatCard label="Total students" icon={Users} value={totalStudents} />
        <KpiStatCard label="Active plans" icon={Zap} value={activePlans} />
        <KpiStatCard
          label="Monthly revenue"
          icon={IndianRupee}
          value="—"
          sub="Placeholder"
        />
      </div>
      <Card>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">Organizations</h3>
          <Link href="/super/organizations" className="text-sm text-primary hover:underline">
            Manage all
          </Link>
        </div>
        {orgsQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <div className="overflow-x-auto">
            <table className="data-table min-w-[700px] w-full">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Plan</th>
                  <th>Students</th>
                  <th>Status</th>
                  <th>Created</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {orgs.map((org, idx) => (
                  <tr key={org._id} className={idx % 2 === 1 ? "bg-gray-50" : undefined}>
                    <td className="font-medium text-gray-900">{org.name}</td>
                    <td className="capitalize">{org.plan}</td>
                    <td>{org.studentCount ?? 0}</td>
                    <td>{org.isActive ? "Active" : "Inactive"}</td>
                    <td>
                      {org.createdAt
                        ? new Date(org.createdAt).toLocaleDateString("en-IN")
                        : "—"}
                    </td>
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
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </PageWrapper>
  );
};

export default SuperDashboardPage;
