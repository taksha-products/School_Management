"use client";

import { ChevronDown } from "lucide-react";
import { useId, useState } from "react";
import type { JSX } from "react";

import { BusDetails } from "@/components/parent/BusDetails";
import { BusFreshnessNotice } from "@/components/parent/BusFreshnessNotice";
import { BusStatusPill, useIsStale } from "@/components/parent/BusStatusPill";
import { useNow } from "@/hooks/useNow";
import { BUS_STATUS_META, formatAgo } from "@/lib/busTracking";
import { cn } from "@/lib/utils";
import type { ParentBusView } from "@/types/parentBus";

const TICK_MS = 10_000;

interface BusInfoSheetProps {
  view: ParentBusView;
  /** The latest refresh failed, so the position shown is the last known one. */
  refreshFailed: boolean;
}

/**
 * Bottom sheet over the map: route badge, live status and freshness, with the details
 * (stop, bus, route, driver) one tap away. Collapsing it gives the map the whole screen.
 */
export const BusInfoSheet = ({ view, refreshFailed }: BusInfoSheetProps): JSX.Element | null => {
  // Phones start collapsed so the map keeps most of the screen; larger screens start open.
  const [expanded, setExpanded] = useState(
    () => typeof window === "undefined" || window.innerWidth >= 640
  );
  const detailsId = useId();
  const now = useNow(TICK_MS);
  const position = view.position;
  const stale = useIsStale(position?.lastSeen ?? new Date(0).toISOString());

  if (!view.bus || !position) {
    return null;
  }

  const fresh = !stale;
  const heading = view.bus.routeNumber ?? `Bus ${view.bus.busNumber}`;

  return (
    <aside
      aria-label="Bus details"
      className="rounded-t-2xl border-t border-gray-200 bg-white px-4 pb-4 pt-1 shadow-[0_-4px_16px_rgba(0,0,0,0.08)]"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={expanded ? "Hide bus details" : "Show bus details"}
        onClick={() => setExpanded((value) => !value)}
        className="mx-auto flex min-h-[44px] w-full items-center justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        <ChevronDown
          aria-hidden="true"
          className={cn("h-5 w-5 text-gray-400 transition-transform", !expanded && "rotate-180")}
        />
      </button>

      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <span className="max-w-full shrink-0 truncate rounded-lg bg-primary-50 px-3 py-1 text-base font-extrabold text-primary">
          {heading}
        </span>
        <BusStatusPill position={position} />
      </div>

      <p className="mt-2 flex items-center gap-2 text-sm text-gray-500">
        <span
          aria-hidden="true"
          className={cn("inline-block h-2 w-2 rounded-full", fresh && "animate-pulse")}
          style={{ backgroundColor: fresh ? BUS_STATUS_META[position.status].color : "#9ca3af" }}
        />
        {fresh ? "Live, updated" : "Last update"} {formatAgo(position.lastSeen, now)}
      </p>

      <BusFreshnessNotice lastSeen={position.lastSeen} refreshFailed={refreshFailed} />

      <div id={detailsId} hidden={!expanded} className="mt-1 border-t border-gray-100 pt-1">
        <BusDetails view={view} />
      </div>
    </aside>
  );
};
