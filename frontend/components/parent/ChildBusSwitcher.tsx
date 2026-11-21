"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Student } from "@/types";

const CHILDREN_STALE_MS = 60_000;

/** Quick switch between a parent's children when they have a trackable bus each. */
interface ChildBusSwitcherProps {
  currentStudentId: string;
  /** Chips sit on top of the map: white with a soft shadow so they stay readable. */
  floating?: boolean;
}

export const ChildBusSwitcher = ({
  currentStudentId,
  floating = false
}: ChildBusSwitcherProps): JSX.Element | null => {
  // Same key and fetcher as the dashboard, so this is usually served from the cache.
  const childrenQuery = useQuery({
    queryKey: ["parent-children"],
    queryFn: async ({ signal }) =>
      (await api.get<{ data: Student[] }>("/api/parent/children", { signal })).data.data,
    staleTime: CHILDREN_STALE_MS
  });

  const trackable = (childrenQuery.data ?? []).filter((child) => child.transport?.trackingEnabled);
  if (trackable.length < 2) {
    return null;
  }

  return (
    <nav
      aria-label="Choose child"
      className={cn("flex gap-2", floating ? "flex-nowrap" : "flex-wrap")}
    >
      {trackable.map((child) => {
        const active = child._id === currentStudentId;
        return (
          <Link
            key={child._id}
            href={`/parent/child/${child._id}/bus`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
              active
                ? "border-primary bg-primary text-white"
                : "border-gray-200 bg-white text-gray-700 hover:border-gray-400",
              floating && "shadow-md"
            )}
          >
            {floating ? (child.name.split(" ")[0] ?? child.name) : child.name}
          </Link>
        );
      })}
    </nav>
  );
};
