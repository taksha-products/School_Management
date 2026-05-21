"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { ListPagination } from "@/components/shared/ListPagination";
import { PageWrapper } from "@/components/layout/PageWrapper";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import type { PaginatedResponse } from "@/types/pagination";
import type { OrgUser } from "@/types/schoolFees";

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
    <PageWrapper title="All Users">
      <Card>
        <div className="mb-4 flex flex-wrap gap-2">
          <select
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
            className="rounded border px-3 py-2 text-sm"
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
            className="rounded border px-3 py-2 text-sm"
          >
            <option value="">All organizations</option>
            {orgs.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>
        <table className="w-full text-sm">
          <thead className="text-left text-slate-500">
            <tr>
              <th className="p-2">Name</th>
              <th>Email</th>
              <th>Role</th>
              <th>Organization</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {users.map((user) => (
              <tr key={user._id} className="border-t border-slate-100">
                <td className="p-2 font-medium">{user.name}</td>
                <td>{user.email}</td>
                <td className="capitalize">{user.role}</td>
                <td>
                  {typeof user.organizationId === "object"
                    ? user.organizationId?.name ?? "—"
                    : "—"}
                </td>
                <td>{user.isActive ? "Active" : "Inactive"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {pagination && (
          <ListPagination pagination={pagination} noun="users" onPageChange={setPage} />
        )}
      </Card>
    </PageWrapper>
  );
};

export default SuperUsersPage;
