"use client";

import type { ReactNode } from "react";

import { canDo, getUser, type StaffPermissions, type UserRole } from "@/lib/auth";

interface PermissionGateProps {
  role?: UserRole[];
  permission?: keyof StaffPermissions;
  children: ReactNode;
  fallback?: ReactNode;
}

export const PermissionGate = ({
  role,
  permission,
  children,
  fallback = null
}: PermissionGateProps): ReactNode => {
  const user = getUser();
  if (!user) {
    return fallback;
  }

  if (role && !role.includes(user.role)) {
    if (user.role === "superAdmin" && role.includes("orgAdmin")) {
      // superAdmin may access orgAdmin-gated UI when applicable
    } else if (!role.includes(user.role)) {
      return fallback;
    }
  }

  if (permission && !canDo(permission)) {
    return fallback;
  }

  return children;
};
