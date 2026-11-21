"use client";

import { useNow } from "@/hooks/useNow";
import { BUS_STATUS_META, formatDuration } from "@/lib/busTracking";
import { cn } from "@/lib/utils";
import type { ParentBusPosition } from "@/types/parentBus";

const TICK_MS = 10_000;
/** Beyond this the last status is no longer trustworthy (matches the freshness notice). */
export const STALE_AFTER_MS = 60_000;

/** Whether the last signal is too old to trust, re-evaluated on its own tick. */
export const useIsStale = (lastSeen: string): boolean => {
  const now = useNow(TICK_MS);
  const age = now - new Date(lastSeen).getTime();
  return !Number.isNaN(age) && age > STALE_AFTER_MS;
};

/**
 * "Moving 28 km/h", "Stopped for 4 min" or "No recent signal". Ticks on its own so the
 * surrounding page does not re-render.
 */
export const BusStatusPill = ({ position }: { position: ParentBusPosition }): JSX.Element => {
  const now = useNow(TICK_MS);
  const meta = BUS_STATUS_META[position.status];
  const stale = useIsStale(position.lastSeen);

  let label: string;
  let tone: string;
  if (stale) {
    label = "No recent signal";
    tone = "bg-gray-100 text-gray-600";
  } else if (position.status === "live") {
    label = `Moving ${Math.round(position.speed)} km/h`;
    tone = meta.badgeClass;
  } else {
    const stoppedMs = position.stoppedSince ? now - new Date(position.stoppedSince).getTime() : 0;
    label = stoppedMs >= 60_000 ? `Stopped for ${formatDuration(stoppedMs)}` : "Stopped";
    tone = meta.badgeClass;
  }

  return (
    <span
      role="status"
      aria-live="polite"
      className={cn("whitespace-nowrap rounded-full px-3 py-1 text-sm font-semibold", tone)}
    >
      {label}
    </span>
  );
};
