"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";

import { api } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { Student } from "@/types";

const CHILDREN_STALE_MS = 60_000;

/** Quick switch between a parent's children when they have a trackable bus each. */
export const ChildBusSwitcher = ({ currentStudentId }: { currentStudentId: string }): JSX.Element | null => {
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
    <nav aria-label="Choose child" className="mb-3 flex flex-wrap gap-2">
      {trackable.map((child) => {
        const active = child._id === currentStudentId;
        return (
          <Link
            key={child._id}
            href={`/parent/child/${child._id}/bus`}
            aria-current={active ? "page" : undefined}
            className={cn(
              "inline-flex min-h-[44px] items-center rounded-full border px-4 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900",
              active
                ? "border-slate-900 bg-slate-900 text-white"
                : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
            )}
          >
            {child.name}
          </Link>
        );
      })}
    </nav>
  );
};
