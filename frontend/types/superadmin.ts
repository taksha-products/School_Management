import type { Organization } from "@/types/schoolFees";

export interface SuperDashboardStats {
  totalOrganizations: number;
  totalStudents: number;
  activePlans: number;
  monthlyRevenue: number;
}

export interface SuperDashboardData {
  stats: SuperDashboardStats;
  organizations: Organization[];
}

export interface SuperDashboardResponse {
  success: boolean;
  data: SuperDashboardData;
  message?: string;
}

export interface OrgAdminAccount {
  _id: string;
  name: string;
  email: string;
  createdAt: string;
  lastLogin?: string | null;
}

export interface OrgAdminResponse {
  success: boolean;
  data: OrgAdminAccount;
  message?: string;
}
