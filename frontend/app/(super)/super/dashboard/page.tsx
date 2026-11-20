"use client";

import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { JSX } from "react";

import { SuperKpiStatCard } from "@/components/dashboard/SuperKpiStatCard";
import { SuperPageWrapper } from "@/components/layout/SuperPageWrapper";
import { SuperAdminStatusBadge } from "@/components/superadmin/SuperAdminStatusBadge";
import { SuperAdminSectionCard } from "@/components/superadmin/SuperAdminSectionCard";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { PaginatedResponse } from "@/types/pagination";
import type { Organization } from "@/types/schoolFees";
import type { SuperDashboardResponse } from "@/types/superadmin";

const TABLE_PAGE_SIZE = 10;

const formatInr = (amount: number): string =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0
  }).format(amount);

const formatCount = (value: number): string =>
  new Intl.NumberFormat("en-IN").format(value);

const orgsAddedThisMonth = (orgs: Organization[]): number => {
  const now = new Date();
  const month = now.getMonth();
  const year = now.getFullYear();
  return orgs.filter((org) => {
    if (!org.createdAt) return false;
    const created = new Date(org.createdAt);
    return created.getMonth() === month && created.getFullYear() === year;
  }).length;
};

const SuperDashboardPage = (): JSX.Element => {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [tablePage, setTablePage] = useState(1);

  const dashboardQuery = useQuery({
    queryKey: ["super-dashboard"],
    queryFn: async () =>
      (await api.get<SuperDashboardResponse>("/api/superadmin/dashboard")).data.data
  });

  const orgsQuery = useQuery({
    queryKey: ["super-orgs-dashboard-list"],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<Organization>>("/api/superadmin/organizations", {
          params: { page: 1, limit: 500 }
        })
      ).data,
    placeholderData: keepPreviousData
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) =>
      api.put(`/api/superadmin/organizations/${id}/status`, { isActive }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["super-dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["super-orgs"] });
      void queryClient.invalidateQueries({ queryKey: ["super-orgs-dashboard-list"] });
    }
  });

  const stats = dashboardQuery.data?.stats;
  const isStatsLoading = dashboardQuery.isLoading;
  const isTableLoading = orgsQuery.isLoading;

  const allOrgs = orgsQuery.data?.data ?? [];

  const filteredOrgs = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) {
      return allOrgs;
    }
    return allOrgs.filter(
      (org) =>
        org.name.toLowerCase().includes(query) ||
        (org.code?.toLowerCase().includes(query) ?? false)
    );
  }, [allOrgs, search]);

  const totalPages = Math.max(1, Math.ceil(filteredOrgs.length / TABLE_PAGE_SIZE));

  useEffect(() => {
    setTablePage(1);
  }, [search]);

  useEffect(() => {
    if (tablePage > totalPages) {
      setTablePage(totalPages);
    }
  }, [tablePage, totalPages]);

  const pageOrgs = filteredOrgs.slice(
    (tablePage - 1) * TABLE_PAGE_SIZE,
    tablePage * TABLE_PAGE_SIZE
  );

  const rangeStart = filteredOrgs.length === 0 ? 0 : (tablePage - 1) * TABLE_PAGE_SIZE + 1;
  const rangeEnd = Math.min(tablePage * TABLE_PAGE_SIZE, filteredOrgs.length);

  const newOrgsThisMonth = orgsAddedThisMonth(allOrgs);
  const orgFootnote =
    newOrgsThisMonth > 0
      ? `+${newOrgsThisMonth} this month`
      : "No new organizations this month";

  return (
    <SuperPageWrapper title="Super Admin Dashboard" subtitle="Platform-wide overview">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <SuperKpiStatCard
          label="Total organizations"
          value={isStatsLoading ? "—" : (stats?.totalOrganizations ?? 0)}
          footnote={orgFootnote}
        />
        <SuperKpiStatCard
          label="Total students"
          value={isStatsLoading ? "—" : formatCount(stats?.totalStudents ?? 0)}
          footnote="Across all organizations"
        />
        <SuperKpiStatCard
          label="Active organizations"
          value={isStatsLoading ? "—" : (stats?.activeOrganizations ?? 0)}
          footnote="Currently enabled on the platform"
        />
        <SuperKpiStatCard
          label="Monthly revenue"
          value={isStatsLoading ? "—" : formatInr(stats?.monthlyRevenue ?? 0)}
          footnote={(stats?.monthlyRevenue ?? 0) === 0 ? "No change" : "Current billing period"}
        />
      </div>

      <SuperAdminSectionCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900 md:text-xl">
            Organizations
          </h2>
          <div className="flex w-full flex-row items-center gap-2.5 sm:w-auto">
            <div className="relative min-w-0 flex-1 sm:w-[min(100vw-3rem,22rem)] sm:flex-none md:w-[26rem]">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search organizations..."
                className="h-10 w-full rounded-md border border-gray-200 bg-white pl-9 pr-3 text-sm text-gray-900 outline-none transition placeholder:text-gray-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
              />
            </div>
            <Link
              href="/super/organizations"
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-primary px-5 text-sm font-medium text-white shadow-sm transition hover:bg-primary-hover"
            >
              Manage all
            </Link>
          </div>
        </div>

        {isTableLoading ? (
          <TableSkeleton />
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[640px] overflow-hidden rounded-md border border-gray-200">
              <table className="w-full table-fixed text-left text-sm">
                <colgroup>
                  <col className="w-[34%]" />
                  <col className="w-[14%]" />
                  <col className="w-[12%]" />
                  <col className="w-[18%]" />
                  <col className="w-[22%]" />
                </colgroup>
                <thead>
                  <tr className="bg-[#F9FAFB]">
                    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Name
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Plan
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Students
                    </th>
                    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Status
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wide text-gray-500">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {pageOrgs.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                        {search.trim() ? "No organizations match your search." : "No organizations found."}
                      </td>
                    </tr>
                  ) : (
                    pageOrgs.map((org, index) => (
                      <tr
                        key={org._id}
                        className={cn(index % 2 === 1 && "bg-[#FAFAFA]")}
                      >
                        <td className="truncate px-4 py-3 font-semibold text-gray-900">
                          <Link
                            href={`/super/organizations/${org._id}`}
                            className="text-gray-900 transition hover:text-primary"
                          >
                            {org.name}
                          </Link>
                        </td>
                        <td className="px-4 py-3 capitalize text-gray-600">{org.plan}</td>
                        <td className="px-4 py-3 tabular-nums text-gray-600">
                          {org.studentCount ?? 0}
                        </td>
                        <td className="px-4 py-3">
                          <SuperAdminStatusBadge active={org.isActive} />
                        </td>
                        <td className="px-4 py-3 text-right">
                          <button
                            type="button"
                            disabled={toggleMutation.isPending}
                            onClick={() =>
                              toggleMutation.mutate({ id: org._id, isActive: !org.isActive })
                            }
                            className="inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {org.isActive ? "Deactivate" : "Activate"}
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
              </div>
            </div>

            {filteredOrgs.length > 0 && (
              <div className="mt-4 flex flex-col gap-3 pt-1 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm text-gray-500">
                  Showing {rangeStart} to {rangeEnd} of {filteredOrgs.length} organizations
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Previous page"
                    disabled={tablePage <= 1}
                    onClick={() => setTablePage((current) => Math.max(1, current - 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </button>
                  {Array.from({ length: totalPages }, (_, index) => index + 1).map((pageNumber) => (
                    <button
                      key={pageNumber}
                      type="button"
                      aria-label={`Page ${pageNumber}`}
                      aria-current={pageNumber === tablePage ? "page" : undefined}
                      onClick={() => setTablePage(pageNumber)}
                      className={cn(
                        "flex h-9 min-w-[36px] items-center justify-center rounded-md px-2 text-sm font-medium transition",
                        pageNumber === tablePage
                          ? "bg-[#F97316] text-white shadow-sm"
                          : "border border-gray-200 bg-white text-gray-700 hover:bg-gray-50"
                      )}
                    >
                      {pageNumber}
                    </button>
                  ))}
                  <button
                    type="button"
                    aria-label="Next page"
                    disabled={tablePage >= totalPages}
                    onClick={() => setTablePage((current) => Math.min(totalPages, current + 1))}
                    className="flex h-9 w-9 items-center justify-center rounded-md border border-gray-200 bg-white text-gray-600 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
          </>
        )}
      </SuperAdminSectionCard>
    </SuperPageWrapper>
  );
};

export default SuperDashboardPage;
