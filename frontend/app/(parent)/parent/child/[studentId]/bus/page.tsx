"use client";

import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import { Bus } from "lucide-react";
import dynamic from "next/dynamic";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BusDetails } from "@/components/parent/BusDetails";
import { BusInfoSheet } from "@/components/parent/BusInfoSheet";
import { BusPageControls } from "@/components/parent/BusPageControls";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import { nextPollDelay, PollHealth, POLL_REQUEST_TIMEOUT_MS } from "@/lib/polling";
import type { ParentBusState, ParentBusView, ParentTrailPoint } from "@/types/parentBus";

// Phones: the map fills the screen under the header and the panel overlays its bottom.
// Tablets and up (sm): a shorter map, with the panel below it instead of over it.
const MAP_HEIGHT =
  "h-[calc(100dvh-8rem)] min-h-[420px] max-h-[760px] sm:h-[min(62dvh,560px)] sm:min-h-[300px]";

// The map (Leaflet) is loaded on demand so it never slows down the rest of the page.
const ParentBusMap = dynamic(
  () => import("@/components/gps/ParentBusMap").then((module) => module.ParentBusMap),
  {
    ssr: false,
    loading: () => <div className={`${MAP_HEIGHT} w-full animate-pulse rounded-2xl bg-gray-200`} />
  }
);

const RUNNING_POLL_MS = 10_000;
const IDLE_POLL_MS = 30_000;
const TRAIL_POLL_MS = 60_000;
const DATA_STALE_MS = 5_000;
const TRAIL_STALE_MS = 30_000;
const MAX_RETRIES = 2;
const MAX_LIVE_TRAIL_POINTS = 200;

/** Retry network and server errors a couple of times; never retry 4xx (403/404 are final). */
const shouldRetry = (failureCount: number, error: unknown): boolean => {
  const status = (error as AxiosError).response?.status;
  if (status !== undefined && status < 500) {
    return false;
  }
  return failureCount < MAX_RETRIES;
};

/**
 * Retry policy that also tells the poll tracker when a whole round has failed (the last retry
 * is used up, or the error is final), so one bad round counts once, not once per attempt.
 */
const retryAndTrack =
  (health: PollHealth) =>
  (failureCount: number, error: unknown): boolean => {
    const again = shouldRetry(failureCount, error);
    if (!again) {
      health.failed(error);
    }
    return again;
  };

const errorMessage = (error: unknown): string => {
  const status = (error as AxiosError).response?.status;
  if (status === 403) {
    return "Live bus tracking isn't available for your school.";
  }
  if (status === 404) {
    return "We couldn't find this child.";
  }
  return "We couldn't load the bus right now. Check your connection and try again.";
};

const STATE_COPY: Record<Exclude<ParentBusState, "running">, { title: string; body: string }> = {
  no_bus: {
    title: "No school bus assigned",
    body: "Your child isn't assigned to a school bus yet. Contact the school office to set one up."
  },
  tracking_unavailable: {
    title: "Live tracking isn't set up for this bus",
    body: "The school hasn't connected a GPS tracker to this bus yet."
  },
  not_running: {
    title: "The bus isn't running right now",
    body: "You'll see it here when it's on its route."
  }
};

const StateCard = ({ title, body }: { title: string; body: string }): JSX.Element => (
  <Card className="rounded-2xl px-6 py-10 text-center">
    <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gray-100">
      <Bus aria-hidden="true" className="h-8 w-8 text-gray-500" />
    </div>
    <p className="text-lg font-extrabold text-gray-900">{title}</p>
    <p className="mx-auto mt-1 max-w-sm text-sm text-gray-500">{body}</p>
  </Card>
);

const PageSkeleton = (): JSX.Element => (
  <div aria-busy="true" aria-label="Loading bus" className="space-y-4">
    <div className="h-11 w-2/3 animate-pulse rounded-full bg-gray-200" />
    <div className={`${MAP_HEIGHT} w-full animate-pulse rounded-2xl bg-gray-200`} />
  </div>
);

const ParentBusContent = ({ studentId }: { studentId: string }): JSX.Element => {
  // How each polled request is doing, so polling can back off when the server struggles.
  const [busHealth] = useState(() => new PollHealth());
  const [trailHealth] = useState(() => new PollHealth());

  const busQuery = useQuery({
    queryKey: ["parent-child-bus", studentId],
    queryFn: async ({ signal }) => {
      const view = (
        await api.get<{ data: ParentBusView }>(`/api/parent/children/${studentId}/bus`, {
          signal,
          timeout: POLL_REQUEST_TIMEOUT_MS
        })
      ).data.data;
      busHealth.succeeded();
      return view;
    },
    // Poll faster while the bus runs (react-query pauses polling in background tabs), slow down
    // after failures, and stop when the answer is final (not found / not allowed).
    refetchInterval: (query) =>
      busHealth.stopped
        ? false
        : nextPollDelay(
            query.state.data?.state === "running" ? RUNNING_POLL_MS : IDLE_POLL_MS,
            busHealth.failures,
            busHealth.retryAfterMs
          ),
    refetchIntervalInBackground: false,
    staleTime: DATA_STALE_MS,
    retry: retryAndTrack(busHealth)
  });

  const view = busQuery.data;
  const isRunning = view?.state === "running";

  const trailQuery = useQuery({
    queryKey: ["parent-child-bus-trail", studentId],
    enabled: isRunning,
    queryFn: async ({ signal }) => {
      const points = (
        await api.get<{ data: { points: ParentTrailPoint[] } }>(
          `/api/parent/children/${studentId}/bus/trail`,
          { signal, timeout: POLL_REQUEST_TIMEOUT_MS }
        )
      ).data.data.points;
      trailHealth.succeeded();
      return points;
    },
    refetchInterval: () =>
      trailHealth.stopped
        ? false
        : nextPollDelay(TRAIL_POLL_MS, trailHealth.failures, trailHealth.retryAfterMs),
    refetchIntervalInBackground: false,
    staleTime: TRAIL_STALE_MS,
    retry: retryAndTrack(trailHealth)
  });

  // Extend the stored trail with each position seen while the page is open.
  const livePoints = useRef<ParentTrailPoint[]>([]);
  const [liveVersion, setLiveVersion] = useState(0);
  const position = view?.position ?? null;
  useEffect(() => {
    if (!position) {
      return;
    }
    const time = new Date(position.lastSeen).getTime();
    const last = livePoints.current[livePoints.current.length - 1];
    if (Number.isNaN(time) || (last && time <= last[2])) {
      return;
    }
    livePoints.current.push([position.lat, position.lng, time]);
    if (livePoints.current.length > MAX_LIVE_TRAIL_POINTS) {
      livePoints.current.splice(0, livePoints.current.length - MAX_LIVE_TRAIL_POINTS);
    }
    setLiveVersion((value) => value + 1);
  }, [position]);

  const trail = useMemo<[number, number][]>(() => {
    const stored = trailQuery.data ?? [];
    const lastStoredTime = stored.length > 0 ? stored[stored.length - 1]![2] : 0;
    const combined = [...stored, ...livePoints.current.filter((point) => point[2] > lastStoredTime)];
    const coordinates: [number, number][] = [];
    for (const point of combined) {
      const previous = coordinates[coordinates.length - 1];
      if (!previous || previous[0] !== point[0] || previous[1] !== point[1]) {
        coordinates.push([point[0], point[1]]);
      }
    }
    return coordinates;
    // liveVersion signals changes to the mutable live buffer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trailQuery.data, liveVersion]);

  // A refresh failed but an earlier answer is on screen.
  const refreshFailed = busQuery.isError && view !== undefined;

  if (busQuery.isPending) {
    return (
      <div className="mx-auto max-w-3xl pb-8">
        <PageSkeleton />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 pb-8">
        <BusPageControls currentStudentId={studentId} />
        <StateCard title="Bus unavailable" body={errorMessage(busQuery.error)} />
        <Button variant="secondary" onClick={() => void busQuery.refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  const showMap = view.state === "running" && view.position !== null && view.bus !== null;

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <h1 className="sr-only">{view.studentName}&apos;s bus</h1>

      {showMap && view.position && view.bus ? (
        <section aria-label="Live bus map">
          <ParentBusMap
            busNumber={view.bus.busNumber}
            routeNumber={view.bus.routeNumber}
            routeName={view.bus.routeName}
            position={view.position}
            trail={trail}
            topLeft={<BusPageControls currentStudentId={studentId} floating />}
            sheet={<BusInfoSheet view={view} refreshFailed={refreshFailed} />}
          />
        </section>
      ) : (
        <div className="space-y-4">
          <BusPageControls currentStudentId={studentId} />

          <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <p className="text-2xl font-extrabold tracking-tight text-gray-900">
              {view.studentName}&apos;s bus
            </p>
            {view.bus?.routeNumber && (
              <span className="rounded-lg bg-primary-50 px-3 py-1 text-base font-extrabold text-primary">
                {view.bus.routeNumber}
              </span>
            )}
          </div>

          {view.state !== "running" && <StateCard {...STATE_COPY[view.state]} />}

          {view.bus && <BusDetails view={view} />}
        </div>
      )}

    </div>
  );
};

/**
 * Keyed by child: switching children mounts a fresh copy, so the map, the live trail buffer and
 * the polling state of one child can never carry over to another.
 */
const ParentBusPage = (): JSX.Element => {
  const { studentId } = useParams<{ studentId: string }>();
  return <ParentBusContent key={studentId} studentId={studentId} />;
};

export default ParentBusPage;
