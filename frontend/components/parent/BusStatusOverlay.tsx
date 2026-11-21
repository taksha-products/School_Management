"use client";

import { useNow } from "@/hooks/useNow";
import { BUS_STATUS_META, formatAgo, formatDuration } from "@/lib/busTracking";
import type { ParentBusPosition } from "@/types/parentBus";

const TICK_MS = 10_000;
/** Same threshold as the freshness notice: beyond this the last status is no longer trustworthy. */
const STALE_AFTER_MS = 60_000;
const STALE_COLOR = "#9ca3af";

/**
 * Status chip shown on top of the map, so the parent sees "Moving / Stopped for 4 min" and
 * how fresh it is without scrolling. Ticks on its own; the map and page do not re-render.
 */
export const BusStatusOverlay = ({ position }: { position: ParentBusPosition }): JSX.Element => {
  const now = useNow(TICK_MS);
  const meta = BUS_STATUS_META[position.status];

  const age = now - new Date(position.lastSeen).getTime();
  const stale = !Number.isNaN(age) && age > STALE_AFTER_MS;

  let headline: string;
  if (stale) {
    // Do not claim "Moving" for a bus we have not heard from for a while.
    headline = "No recent signal";
  } else if (position.status === "live") {
    headline = `Moving · ${Math.round(position.speed)} km/h`;
  } else if (position.stoppedSince) {
    headline = `Stopped for ${formatDuration(now - new Date(position.stoppedSince).getTime())}`;
  } else {
    headline = "Stopped";
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none rounded-xl bg-white/95 px-3 py-2 shadow-md"
    >
      <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
        <span
          aria-hidden="true"
          className="inline-block h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: stale ? STALE_COLOR : meta.color }}
        />
        {headline}
      </p>
      <p className="text-xs text-slate-500">
        {stale ? "Last update" : "Updated"} {formatAgo(position.lastSeen, now)}
      </p>
    </div>
  );
};
