export type LiveBusStatus = "live" | "stopped" | "offline" | "no_device";

/** Same threshold the API uses to call a bus offline. */
export const OFFLINE_AFTER_MS = 2 * 60 * 1000;
/** Above this speed (km/h) a bus counts as moving. */
export const MOVING_SPEED_KMH = 1;

export interface LiveBusStatusInput {
  hasDevice: boolean;
  lastSeen: string | null;
  speed: number | null;
}

export const deriveBusStatus = (input: LiveBusStatusInput, now: number): LiveBusStatus => {
  if (!input.hasDevice) {
    return "no_device";
  }
  if (!input.lastSeen) {
    return "offline";
  }
  const age = now - new Date(input.lastSeen).getTime();
  if (Number.isNaN(age) || age > OFFLINE_AFTER_MS) {
    return "offline";
  }
  return (input.speed ?? 0) > MOVING_SPEED_KMH ? "live" : "stopped";
};

export const BUS_STATUS_META: Record<
  LiveBusStatus,
  { label: string; color: string; badgeClass: string }
> = {
  live: { label: "Moving", color: "#16a34a", badgeClass: "bg-green-100 text-green-700" },
  stopped: { label: "Stopped", color: "#ea580c", badgeClass: "bg-orange-100 text-orange-700" },
  offline: { label: "Offline", color: "#64748b", badgeClass: "bg-gray-100 text-gray-600" },
  no_device: { label: "No tracker", color: "#9ca3af", badgeClass: "bg-gray-100 text-gray-500" }
};

export const formatLastSeen = (lastSeen: string | null): string => {
  if (!lastSeen) {
    return "Never";
  }
  const date = new Date(lastSeen);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
};

const SHORT_LABEL_MAX = 8;

/**
 * Short code printed on the bus plate so it stays readable on the map,
 * e.g. "KA-01-GF-01" -> "GF-01". The full number stays in the tooltip and popup.
 */
export const shortBusLabel = (busNumber: string): string => {
  const trimmed = busNumber.trim();
  if (trimmed.length <= SHORT_LABEL_MAX) {
    return trimmed;
  }
  const parts = trimmed.split(/[\s\-_/]+/).filter(Boolean);
  const candidate = parts.length >= 2 ? parts.slice(-2).join("-") : trimmed;
  return candidate.length <= SHORT_LABEL_MAX ? candidate : candidate.slice(-SHORT_LABEL_MAX);
};
