"use client";

import { Bell, User } from "lucide-react";
import type { JSX } from "react";

import { getUser } from "@/lib/auth";

const formatRoleLabel = (role: string): string => {
  if (role === "superAdmin") return "Super Admin";
  return role.replace(/([A-Z])/g, " $1").trim();
};

/** Notification + profile (log out lives in sidebar only). */
export const SuperAdminHeaderActions = (): JSX.Element => {
  const user = getUser();
  const name = user?.name?.trim() || "Super Admin";
  const roleLabel = user ? formatRoleLabel(user.role) : "Super Admin";

  return (
    <div className="flex shrink-0 items-center gap-3 md:gap-4">
      <button
        type="button"
        className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm ring-1 ring-gray-200/80 transition hover:text-gray-900"
        aria-label="Notifications"
      >
        <Bell className="h-[18px] w-[18px]" strokeWidth={1.75} />
        <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-red-500 ring-2 ring-white" />
      </button>

      <div className="flex items-center gap-2.5">
        <span className="flex h-10 w-10 items-center justify-center rounded-full bg-white text-gray-600 shadow-sm ring-1 ring-gray-200/80">
          <User className="h-[18px] w-[18px]" strokeWidth={1.75} aria-hidden />
        </span>
        <span className="hidden min-w-0 text-left sm:block">
          <span className="block truncate text-sm font-bold text-gray-900">{name}</span>
          <span className="block truncate text-xs text-gray-500">{roleLabel}</span>
        </span>
      </div>
    </div>
  );
};
