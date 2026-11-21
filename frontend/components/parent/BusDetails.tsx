"use client";

import { Bus, MapPin, Route, Timer, UserRound, type LucideIcon } from "lucide-react";
import type { JSX } from "react";

import { useNow } from "@/hooks/useNow";
import { stopForTrip, tripAt } from "@/lib/busTrip";
import { cn } from "@/lib/utils";
import type { ParentBusView } from "@/types/parentBus";

/** The run (pickup or drop) is re-evaluated this often; a minute is plenty. */
const TRIP_TICK_MS = 60_000;

interface DetailCardProps {
  icon: LucideIcon;
  /** Tailwind classes for the icon's round background and glyph. */
  iconTone: string;
  label: string;
  value: string;
  /** Spans both columns (long values: the stop and the route name). */
  wide?: boolean;
  /** Registration numbers must never break across lines. */
  keepTogether?: boolean;
  children?: JSX.Element | null;
}

const DetailCard = ({
  icon: Icon,
  iconTone,
  label,
  value,
  wide = false,
  keepTogether = false,
  children
}: DetailCardProps): JSX.Element => (
  <div
    className={cn(
      "flex min-w-0 items-center gap-3 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5",
      wide && "min-[420px]:col-span-2"
    )}
  >
    <span
      aria-hidden="true"
      className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full", iconTone)}
    >
      <Icon className="h-5 w-5" />
    </span>
    <div className="min-w-0 flex-1">
      <dt className="text-xs text-gray-500">{label}</dt>
      <dd
        className={cn(
          "text-[15px] font-bold leading-snug text-gray-900",
          keepTogether ? "whitespace-nowrap" : "break-words"
        )}
      >
        {value}
      </dd>
      {children}
    </div>
  </div>
);

interface BusDetailsProps {
  view: ParentBusView;
  /**
   * Minutes until the bus reaches the child's stop. Shown only when given: it needs the stop's
   * location, which the school does not record yet, so nothing is invented.
   */
  etaMinutes?: number | null;
}

/**
 * The facts a parent looks up about the bus. The stop shown is the one for the current run:
 * the pickup stop on the morning run, the drop stop on the way home.
 */
export const BusDetails = ({ view, etaMinutes = null }: BusDetailsProps): JSX.Element | null => {
  const now = useNow(TRIP_TICK_MS);

  if (!view.bus) {
    return null;
  }

  const stop = stopForTrip(view.stops, tripAt(now));

  return (
    <dl className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2">
      {stop && (
        <div className="flex items-stretch gap-3 min-[420px]:col-span-2 rounded-xl border border-gray-100 bg-gray-50/80 px-3 py-2.5">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <span
              aria-hidden="true"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary-50 text-primary"
            >
              <MapPin className="h-5 w-5" />
            </span>
            <div className="min-w-0">
              <dt className="text-xs text-gray-500">{stop.label}</dt>
              <dd className="break-words text-[15px] font-bold leading-snug text-gray-900">{stop.name}</dd>
              {stop.other && (
                <p className="mt-0.5 text-xs text-gray-500">
                  {stop.other.label}: {stop.other.name}
                </p>
              )}
            </div>
          </div>
          {etaMinutes !== null && (
            <div className="flex shrink-0 items-center gap-2 border-l border-gray-200 pl-3">
              <Timer aria-hidden="true" className="h-5 w-5 text-gray-700" />
              <div>
                <dt className="text-xs text-gray-500">ETA</dt>
                <dd className="text-[15px] font-bold text-gray-900">
                  {etaMinutes < 1 ? "< 1 min" : `${Math.round(etaMinutes)} min`}
                </dd>
              </div>
            </div>
          )}
        </div>
      )}

      <DetailCard
        icon={Bus}
        iconTone="bg-blue-50 text-blue-600"
        label="Bus"
        value={view.bus.busNumber}
        wide={!view.bus.driverName}
        keepTogether
      />
      {view.bus.driverName && (
        <DetailCard
          icon={UserRound}
          iconTone="bg-violet-50 text-violet-600"
          label="Driver"
          value={view.bus.driverName}
        />
      )}
      <DetailCard
        icon={Route}
        iconTone="bg-emerald-50 text-emerald-600"
        label="Route name"
        value={view.bus.routeName}
        wide
      />
    </dl>
  );
};
