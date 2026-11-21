import type { ChildStops } from "@/types/parentBus";

export type BusTrip = "pickup" | "drop";

/**
 * The bus runs twice a day: a morning run that picks children up and an afternoon run that
 * brings them home. Schools do not enter trip times yet, so the run is told from the time of
 * day, in India time (the platform serves Indian schools).
 */
const TRIP_TIME_ZONE = "Asia/Kolkata";
/** Before this hour (24 h clock) the bus is on its pickup run, from then on on its drop run. */
const DROP_RUN_STARTS_HOUR = 12;

const hourInSchoolZone = (nowMs: number): number => {
  const parts = new Intl.DateTimeFormat("en-GB", {
    hour: "numeric",
    hourCycle: "h23",
    timeZone: TRIP_TIME_ZONE
  }).formatToParts(new Date(nowMs));
  const hour = Number(parts.find((part) => part.type === "hour")?.value);
  return Number.isFinite(hour) ? hour : 0;
};

export const tripAt = (nowMs: number): BusTrip =>
  hourInSchoolZone(nowMs) < DROP_RUN_STARTS_HOUR ? "pickup" : "drop";

export interface TripStop {
  /** "Pickup stop", "Drop stop", or "Your stop" when one stop serves both runs. */
  label: string;
  name: string;
  /** The stop of the other run, when it is a different place. */
  other: { label: string; name: string } | null;
}

/** The stop that matters on the current run, so a parent never reads "Pickup" on the way home. */
export const stopForTrip = (stops: ChildStops | null, trip: BusTrip): TripStop | null => {
  const pickup = stops?.pickup?.trim() || null;
  const drop = stops?.drop?.trim() || null;

  if (!pickup && !drop) {
    return null;
  }
  // One stop (or the same stop twice): it serves both runs.
  if (!pickup || !drop || pickup === drop) {
    return { label: "Your stop", name: (pickup ?? drop) as string, other: null };
  }
  return trip === "pickup"
    ? { label: "Pickup stop", name: pickup, other: { label: "Drop stop", name: drop } }
    : { label: "Drop stop", name: drop, other: { label: "Pickup stop", name: pickup } };
};
