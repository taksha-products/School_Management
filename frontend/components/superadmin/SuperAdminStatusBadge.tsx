import type { JSX } from "react";

import { cn } from "@/lib/utils";

export const SuperAdminStatusBadge = ({ active }: { active: boolean }): JSX.Element => (
  <span
    className={cn(
      "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium",
      active ? "bg-emerald-50 text-emerald-700" : "bg-gray-100 text-gray-600"
    )}
  >
    <span
      className={cn("h-1.5 w-1.5 shrink-0 rounded-full", active ? "bg-emerald-500" : "bg-gray-400")}
      aria-hidden
    />
    {active ? "Active" : "Inactive"}
  </span>
);

export const superAdminTableHeadClass =
  "px-4 py-2.5 text-[11px] font-medium uppercase tracking-wide text-gray-500";

export const superAdminFilterSelectClass =
  "h-10 rounded-md border border-gray-200 bg-white px-3 text-sm text-gray-900 outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15";

export const superAdminOutlineButtonClass =
  "inline-flex items-center justify-center rounded-md border border-gray-200 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 transition hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60";
