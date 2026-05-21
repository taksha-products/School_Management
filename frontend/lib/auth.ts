import { jwtDecode } from "jwt-decode";

export type UserRole = "superAdmin" | "orgAdmin" | "staff" | "parent";

export interface StaffPermissions {
  canCollectFees: boolean;
  canManageStudents: boolean;
  canViewReports: boolean;
  canManageBuses: boolean;
}

export interface AuthUser {
  userId: string;
  role: UserRole;
  organizationId: string | null;
  name: string;
  staffPermissions?: StaffPermissions;
  parentStudentIds?: string[];
  exp?: number;
}

const TOKEN_KEY = "bustrack_token";

export const saveToken = (token: string): void => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
};

export const getToken = (): string | null => {
  if (typeof window === "undefined") {
    return null;
  }
  return localStorage.getItem(TOKEN_KEY);
};

export const getUser = (): AuthUser | null => {
  const token = getToken();
  if (!token) {
    return null;
  }
  try {
    return jwtDecode<AuthUser>(token);
  } catch {
    return null;
  }
};

export const logout = (): void => {
  if (typeof window === "undefined") {
    return;
  }
  localStorage.removeItem(TOKEN_KEY);
  window.location.href = "/login";
};

export const getRoleDashboardPath = (role: UserRole): string => {
  switch (role) {
    case "superAdmin":
      return "/super/dashboard";
    case "orgAdmin":
      return "/admin/dashboard";
    case "staff":
      return "/staff/dashboard";
    case "parent":
      return "/parent/dashboard";
    default:
      return "/login";
  }
};

export const isSuperAdmin = (): boolean => getUser()?.role === "superAdmin";
export const isOrgAdmin = (): boolean => getUser()?.role === "orgAdmin";
export const isStaff = (): boolean => getUser()?.role === "staff";
export const isParent = (): boolean => getUser()?.role === "parent";

export const canDo = (permission: keyof StaffPermissions): boolean => {
  const user = getUser();
  if (!user) {
    return false;
  }
  if (user.role === "superAdmin" || user.role === "orgAdmin") {
    return true;
  }
  if (user.role === "staff") {
    return !!user.staffPermissions?.[permission];
  }
  return false;
};
