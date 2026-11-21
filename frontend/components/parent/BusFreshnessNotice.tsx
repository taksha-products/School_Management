"use client";

import { useNow } from "@/hooks/useNow";
import { formatDuration } from "@/lib/busTracking";

/** A bus whose last signal is older than this gets a "low signal" note. */
const STALE_AFTER_MS = 60_000;
const TICK_MS = 5_000;

interface BusFreshnessNoticeProps {
  lastSeen: string;
  /** The latest refresh failed, so what is on screen is the last known position. */
  refreshFailed: boolean;
}

/** Tells the parent when the position on screen may be out of date, instead of hiding it. */
export const BusFreshnessNotice = ({
  lastSeen,
  refreshFailed
}: BusFreshnessNoticeProps): JSX.Element | null => {
  const now = useNow(TICK_MS);
  const age = now - new Date(lastSeen).getTime();

  let message: string | null = null;
  if (refreshFailed) {
    message = "Can't refresh right now. Showing the last known position.";
  } else if (!Number.isNaN(age) && age > STALE_AFTER_MS) {
    message = `Last signal ${formatDuration(age)} ago. The bus may be in a low-signal area.`;
  }

  if (!message) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800"
    >
      {message}
    </div>
  );
};
