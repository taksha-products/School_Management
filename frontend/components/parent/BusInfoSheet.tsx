"use client";

import { ChevronDown, Info, MapPin } from "lucide-react";
import { useId, useState } from "react";
import type { JSX } from "react";

import { BusDetails } from "@/components/parent/BusDetails";
import { BusFreshnessNotice } from "@/components/parent/BusFreshnessNotice";
import { BusStatusPill, useIsStale } from "@/components/parent/BusStatusPill";
import { useNow } from "@/hooks/useNow";
import { BUS_STATUS_META, formatAgo } from "@/lib/busTracking";
import { stopForTrip, tripAt } from "@/lib/busTrip";
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
  const stop = stopForTrip(view.stops, tripAt(now));

  return (
    <aside
      aria-label="Bus details"
      className="rounded-t-2xl border-t border-gray-200 bg-white px-4 pb-3 shadow-[0_-4px_16px_rgba(0,0,0,0.08)] sm:rounded-none sm:px-5 sm:pb-4 sm:shadow-none"
    >
      <button
        type="button"
        aria-expanded={expanded}
        aria-controls={detailsId}
        aria-label={expanded ? "Hide bus details" : "Show bus details"}
        onClick={() => setExpanded((value) => !value)}
        className="mx-auto flex min-h-[36px] w-full flex-col items-center justify-center gap-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        <span aria-hidden="true" className="h-1 w-10 rounded-full bg-gray-300" />
        <ChevronDown
          aria-hidden="true"
          className={cn("h-4 w-4 text-gray-400 transition-transform", !expanded && "rotate-180")}
        />
      </button>

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-stretch gap-3">
          <span aria-hidden="true" className="w-1 shrink-0 rounded-full bg-primary" />
          <div className="min-w-0">
            <h2 className="truncate text-xl font-extrabold leading-tight text-gray-900">{heading}</h2>
            <p className="mt-1 flex items-center gap-2 whitespace-nowrap text-sm text-gray-500">
              <span
                aria-hidden="true"
                className={cn("inline-block h-2 w-2 rounded-full", fresh && "animate-pulse")}
                style={{ backgroundColor: fresh ? BUS_STATUS_META[position.status].color : "#9ca3af" }}
              />
              {fresh ? "Updated" : "Last update"} {formatAgo(position.lastSeen, now)}
            </p>
          </div>
        </div>
        <BusStatusPill position={position} />
      </div>

      <BusFreshnessNotice lastSeen={position.lastSeen} refreshFailed={refreshFailed} />

      {/* Collapsed: the one detail a parent checks first stays visible (the stop for this run). */}
      {!expanded && stop && (
        <p className="mt-3 flex items-start gap-2 text-sm font-semibold text-gray-900">
          <MapPin aria-hidden="true" className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 break-words">
            {stop.label}: {stop.name}
          </span>
        </p>
      )}

      <div id={detailsId} hidden={!expanded} className="mt-3 space-y-2.5">
        <BusDetails view={view} />
        <div className="flex items-start gap-3 rounded-xl bg-blue-50 px-3 py-2.5">
          <Info aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
          <div>
            <p className="text-sm font-semibold text-gray-900">Live tracking information</p>
            <p className="text-xs text-gray-600">
              Bus location updates are available while the vehicle is on its route.
            </p>
          </div>
        </div>
      </div>
    </aside>
  );
};
