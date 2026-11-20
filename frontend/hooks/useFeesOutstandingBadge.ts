import { useQuery } from "@tanstack/react-query";

import { useAcademicYear } from "@/hooks/useAcademicYear";
import { getUser } from "@/lib/auth";
import { api } from "@/lib/api";
import type { PaginatedResponse } from "@/types/pagination";
import type { OutstandingStudent } from "@/types/schoolFees";
import type { FeePayment } from "@/types";

const currentMonth = (): string => new Date().toISOString().slice(0, 7);

export const useFeesOutstandingBadge = (): number => {
  const orgAcademicYear = useAcademicYear();
  const isOrgAdmin = getUser()?.role === "orgAdmin";
  const month = currentMonth();

  const schoolQuery = useQuery({
    queryKey: ["nav-badge-school-outstanding", orgAcademicYear],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<OutstandingStudent>>("/api/school-fees/outstanding", {
          params: { academicYear: orgAcademicYear, page: 1, limit: 1 }
        })
      ).data.pagination?.total ?? 0,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
    enabled: isOrgAdmin
  });

  const transportQuery = useQuery({
    queryKey: ["nav-badge-transport-pending", month, orgAcademicYear],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<FeePayment>>("/api/fees", {
          params: {
            month,
            academicYear: orgAcademicYear,
            status: "pending",
            page: 1,
            limit: 1
          }
        })
      ).data.pagination?.total ?? 0,
    refetchInterval: 5 * 60 * 1000,
    staleTime: 60_000,
    enabled: isOrgAdmin
  });

  if (!isOrgAdmin) return 0;
  return (schoolQuery.data ?? 0) + (transportQuery.data ?? 0);
};

export const useFeesTabBadges = (): { school: number; transport: number } => {
  const orgAcademicYear = useAcademicYear();
  const month = currentMonth();

  const schoolQuery = useQuery({
    queryKey: ["fees-tab-badge-school", orgAcademicYear],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<OutstandingStudent>>("/api/school-fees/outstanding", {
          params: { academicYear: orgAcademicYear, page: 1, limit: 1 }
        })
      ).data.pagination?.total ?? 0,
    staleTime: 60_000
  });

  const transportQuery = useQuery({
    queryKey: ["fees-tab-badge-transport", month, orgAcademicYear],
    queryFn: async () =>
      (
        await api.get<PaginatedResponse<FeePayment>>("/api/fees", {
          params: {
            month,
            academicYear: orgAcademicYear,
            status: "pending",
            page: 1,
            limit: 1
          }
        })
      ).data.pagination?.total ?? 0,
    staleTime: 60_000
  });

  return {
    school: schoolQuery.data ?? 0,
    transport: transportQuery.data ?? 0
  };
};
