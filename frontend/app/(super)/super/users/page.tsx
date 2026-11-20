"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState, type JSX } from "react";

import { SuperPageWrapper } from "@/components/layout/SuperPageWrapper";
import { SuperAdminListPagination } from "@/components/superadmin/SuperAdminListPagination";
import { SuperAdminSectionCard } from "@/components/superadmin/SuperAdminSectionCard";
import {
  SuperAdminStatusBadge,
  superAdminFilterSelectClass,
  superAdminTableHeadClass
} from "@/components/superadmin/SuperAdminStatusBadge";
import { TableSkeleton } from "@/components/ui/TableSkeleton";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { PaginatedResponse } from "@/types/pagination";
import type { OrgUser } from "@/types/schoolFees";

const formatRoleLabel = (role: string): string => {
  if (role === "superAdmin") return "Super Admin";
  if (role === "orgAdmin") return "Org Admin";
  return role.charAt(0).toUpperCase() + role.slice(1);
};

const SuperUsersPage = (): JSX.Element => {
  const [roleFilter, setRoleFilter] = useState("");
  const [orgFilter, setOrgFilter] = useState("");
  const [page, setPage] = useState(1);

  useEffect(() => {
    setPage(1);
  }, [roleFilter, orgFilter]);

  const usersQuery = useQuery({
    queryKey: ["super-users", { page }],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<OrgUser>>("/api/superadmin/users", {
          params: { page, limit: 30 }
        })
      ).data,
    placeholderData: keepPreviousData
  });

  const users = useMemo(
    () =>
      (usersQuery.data?.data ?? []).filter((u) => {
        if (roleFilter && u.role !== roleFilter) return false;
        if (orgFilter) {
          const orgId =
            typeof u.organizationId === "object" ? u.organizationId?._id : u.organizationId;
          if (orgId !== orgFilter) return false;
        }
        return true;
      }),
    [usersQuery.data?.data, roleFilter, orgFilter]
  );

  const orgs = Array.from(
    new Map(
      (usersQuery.data?.data ?? [])
        .map((u) => {
          if (typeof u.organizationId === "object" && u.organizationId) {
            return [u.organizationId._id, u.organizationId.name] as const;
          }
          return null;
        })
        .filter(Boolean) as [string, string][]
    ).entries()
  );

  const pagination = usersQuery.data?.pagination;

  return (
    <SuperPageWrapper title="All Users" subtitle="Platform-wide user directory">
      <SuperAdminSectionCard>
        <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold tracking-tight text-gray-900">User directory</h2>
          <div className="flex flex-wrap gap-2">
            <select
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              className={superAdminFilterSelectClass}
            >
              <option value="">All roles</option>
              <option value="superAdmin">Super Admin</option>
              <option value="orgAdmin">Org Admin</option>
              <option value="staff">Staff</option>
              <option value="parent">Parent</option>
            </select>
            <select
              value={orgFilter}
              onChange={(e) => setOrgFilter(e.target.value)}
              className={cn(superAdminFilterSelectClass, "min-w-[12rem]")}
            >
              <option value="">All organizations</option>
              {orgs.map(([id, name]) => (
                <option key={id} value={id}>
                  {name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {usersQuery.isLoading ? (
          <TableSkeleton />
        ) : (
          <>
            <div className="overflow-x-auto">
              <div className="min-w-[720px] overflow-hidden rounded-md border border-gray-200">
                <table className="w-full table-fixed text-left text-sm">
                  <colgroup>
                    <col className="w-[22%]" />
                    <col className="w-[28%]" />
                    <col className="w-[14%]" />
                    <col className="w-[22%]" />
                    <col className="w-[14%]" />
                  </colgroup>
                  <thead>
                    <tr className="bg-[#F9FAFB]">
                      <th className={superAdminTableHeadClass}>Name</th>
                      <th className={superAdminTableHeadClass}>Email</th>
                      <th className={superAdminTableHeadClass}>Role</th>
                      <th className={superAdminTableHeadClass}>Organization</th>
                      <th className={superAdminTableHeadClass}>Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 bg-white">
                    {users.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-sm text-gray-500">
                          No users match your filters.
                        </td>
                      </tr>
                    ) : (
                      users.map((user, index) => (
                        <tr key={user._id} className={cn(index % 2 === 1 && "bg-[#FAFAFA]")}>
                          <td className="truncate px-4 py-3 font-semibold text-gray-900">
                            {user.name}
                          </td>
                          <td className="truncate px-4 py-3 text-gray-600">{user.email}</td>
                          <td className="px-4 py-3 text-gray-600">{formatRoleLabel(user.role)}</td>
                          <td className="truncate px-4 py-3 text-gray-600">
                            {typeof user.organizationId === "object"
                              ? (user.organizationId?.name ?? "—")
                              : "—"}
                          </td>
                          <td className="px-4 py-3">
                            <SuperAdminStatusBadge active={user.isActive} />
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>
            {pagination && (
              <SuperAdminListPagination pagination={pagination} noun="users" onPageChange={setPage} />
            )}
          </>
        )}
      </SuperAdminSectionCard>
    </SuperPageWrapper>
  );
};

export default SuperUsersPage;
