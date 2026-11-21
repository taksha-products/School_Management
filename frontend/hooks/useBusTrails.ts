"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";

import type { BusPosition } from "@/hooks/useGpsTracking";
import { api } from "@/lib/api";

/** [latitude, longitude, epoch milliseconds] — same shape the API returns. */
type TrailPoint = [number, number, number];

interface BusTrailApiRow {
  busId: string;
  points: TrailPoint[];
}

/** How far back trails reach. */
export const TRAIL_MINUTES = 30;
const TRAIL_REFRESH_MS = 2 * 60_000;
/** Safety cap on live points kept per bus in memory. */
const MAX_LIVE_POINTS_PER_BUS = 400;

/**
 * Recent track of every bus, as map coordinates.
 *
 * History comes from the API (so trails survive a page reload) and is extended with the
 * live socket positions as they arrive. `now` drives trimming of points older than the window.
 */
export const useBusTrails = (
  livePositions: Map<string, BusPosition>,
  now: number
): Map<string, [number, number][]> => {
  const historyQuery = useQuery({
    queryKey: ["bus-trails", TRAIL_MINUTES],
    queryFn: async () =>
      (
        await api.get<{ data: BusTrailApiRow[] }>("/api/gps/buses/trails", {
          params: { minutes: TRAIL_MINUTES }
        })
      ).data.data,
    refetchInterval: TRAIL_REFRESH_MS
  });

  const liveRef = useRef<Map<string, TrailPoint[]>>(new Map());
  const [liveVersion, setLiveVersion] = useState(0);

  useEffect(() => {
    let changed = false;
    livePositions.forEach((position, busId) => {
      const time = new Date(position.timestamp).getTime();
      if (Number.isNaN(time)) {
        return;
      }
      const list = liveRef.current.get(busId) ?? [];
      const last = list[list.length - 1];
      if (last && time <= last[2]) {
        return;
      }
      list.push([position.lat, position.lng, time]);
      if (list.length > MAX_LIVE_POINTS_PER_BUS) {
        list.splice(0, list.length - MAX_LIVE_POINTS_PER_BUS);
      }
      liveRef.current.set(busId, list);
      changed = true;
    });
    if (changed) {
      setLiveVersion((value) => value + 1);
    }
  }, [livePositions]);

  return useMemo(() => {
    const cutoff = now - TRAIL_MINUTES * 60_000;
    const trails = new Map<string, [number, number][]>();
    const history = new Map((historyQuery.data ?? []).map((row) => [row.busId, row.points]));
    const busIds = new Set<string>([...history.keys(), ...liveRef.current.keys()]);

    busIds.forEach((busId) => {
      const base = (history.get(busId) ?? []).filter((point) => point[2] >= cutoff);
      const lastBaseTime = base.length > 0 ? base[base.length - 1]![2] : 0;
      const live = (liveRef.current.get(busId) ?? []).filter(
        (point) => point[2] > lastBaseTime && point[2] >= cutoff
      );

      const coordinates: [number, number][] = [];
      for (const point of [...base, ...live]) {
        const previous = coordinates[coordinates.length - 1];
        if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) {
          coordinates.push([point[0], point[1]]);
        }
      }
      if (coordinates.length > 1) {
        trails.set(busId, coordinates);
      }
    });

    return trails;
    // liveVersion signals changes to the (mutable) live buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [historyQuery.data, liveVersion, now]);
};
