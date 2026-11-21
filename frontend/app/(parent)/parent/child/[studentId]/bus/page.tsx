"use client";

import { useQuery } from "@tanstack/react-query";
import type { AxiosError } from "axios";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { BusFreshnessNotice } from "@/components/parent/BusFreshnessNotice";
import { BusStatusOverlay } from "@/components/parent/BusStatusOverlay";
import { ChildBusSwitcher } from "@/components/parent/ChildBusSwitcher";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { api } from "@/lib/api";
import type { ParentBusView, ParentTrailPoint } from "@/types/parentBus";

const MAP_HEIGHT = "h-[58dvh] max-h-[640px] min-h-[320px]";

// The map (Leaflet) is loaded on demand so it never slows down the rest of the page.
const ParentBusMap = dynamic(
  () => import("@/components/gps/ParentBusMap").then((module) => module.ParentBusMap),
  {
    ssr: false,
    loading: () => <div className={`${MAP_HEIGHT} w-full animate-pulse rounded-xl bg-slate-200`} />
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

const errorMessage = (error: unknown): string => {
  const status = (error as AxiosError).response?.status;
  if (status === 403) {
    return "Live bus tracking is not available for your school.";
  }
  if (status === 404) {
    return "We couldn't find this child.";
  }
  return "We couldn't load the bus right now. Please try again.";
};

const MessageCard = ({ title, body }: { title: string; body: string }): JSX.Element => (
  <Card>
    <p className="text-lg font-semibold text-slate-900">{title}</p>
    <p className="mt-1 text-sm text-slate-600">{body}</p>
  </Card>
);

const PageSkeleton = (): JSX.Element => (
  <div aria-busy="true" aria-label="Loading bus">
    <div className="mb-3 h-8 w-2/3 animate-pulse rounded bg-slate-200" />
    <div className={`${MAP_HEIGHT} w-full animate-pulse rounded-xl bg-slate-200`} />
    <div className="mt-3 h-24 w-full animate-pulse rounded-xl bg-slate-200" />
  </div>
);

const DetailRow = ({ label, value }: { label: string; value: string }): JSX.Element => (
  <div>
    <dt className="text-xs uppercase tracking-wide text-slate-500">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-slate-900">{value}</dd>
  </div>
);

const ParentBusContent = ({ studentId }: { studentId: string }): JSX.Element => {

  const busQuery = useQuery({
    queryKey: ["parent-child-bus", studentId],
    queryFn: async ({ signal }) =>
      (await api.get<{ data: ParentBusView }>(`/api/parent/children/${studentId}/bus`, { signal }))
        .data.data,
    // Poll faster while the bus runs; react-query pauses polling in background tabs.
    refetchInterval: (query) =>
      query.state.data?.state === "running" ? RUNNING_POLL_MS : IDLE_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: DATA_STALE_MS,
    retry: shouldRetry
  });

  const view = busQuery.data;
  const isRunning = view?.state === "running";

  const trailQuery = useQuery({
    queryKey: ["parent-child-bus-trail", studentId],
    enabled: isRunning,
    queryFn: async ({ signal }) =>
      (
        await api.get<{ data: { points: ParentTrailPoint[] } }>(
          `/api/parent/children/${studentId}/bus/trail`,
          { signal }
        )
      ).data.data.points,
    refetchInterval: TRAIL_POLL_MS,
    refetchIntervalInBackground: false,
    staleTime: TRAIL_STALE_MS,
    retry: shouldRetry
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

  return (
    <div className="mx-auto max-w-3xl pb-8">
      <Link
        href="/parent/dashboard"
        className="mb-3 inline-flex min-h-[44px] items-center text-sm text-slate-500 hover:text-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        ← My children
      </Link>

      <ChildBusSwitcher currentStudentId={studentId} />

      {busQuery.isError && !view && (
        <div className="space-y-3">
          <MessageCard title="Bus unavailable" body={errorMessage(busQuery.error)} />
          <Button variant="secondary" onClick={() => void busQuery.refetch()}>
            Try again
          </Button>
        </div>
      )}

      {view && (
        <>
          <header className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-2">
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              {view.studentName}&apos;s bus
            </h1>
            {view.bus?.routeNumber && (
              <span className="rounded-lg bg-slate-900 px-3 py-1 text-sm font-bold text-white">
                {view.bus.routeNumber}
              </span>
            )}
          </header>

          {view.state === "no_bus" && (
            <MessageCard
              title="No school bus assigned"
              body="Your child isn't assigned to a school bus yet. Please contact the school office."
            />
          )}

          {view.state === "tracking_unavailable" && (
            <MessageCard
              title="Live tracking isn't set up for this bus"
              body="The school hasn't connected a GPS tracker to this bus yet."
            />
          )}

          {view.state === "not_running" && (
            <MessageCard
              title="The bus isn't running right now"
              body="You'll be able to see the bus here when it is on its route."
            />
          )}

          {view.state === "running" && view.position && view.bus && (
            <>
              <BusFreshnessNotice lastSeen={view.position.lastSeen} refreshFailed={refreshFailed} />

              <section aria-label="Live bus map">
                <ParentBusMap
                  busNumber={view.bus.busNumber}
                  routeNumber={view.bus.routeNumber}
                  routeName={view.bus.routeName}
                  position={view.position}
                  trail={trail}
                  overlay={<BusStatusOverlay position={view.position} />}
                />
              </section>
            </>
          )}

          {view.bus && (
            <Card className="mt-3">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3">
                <DetailRow label="Bus number" value={view.bus.busNumber} />
                <DetailRow label="Route" value={view.bus.routeName} />
                {view.bus.driverName && <DetailRow label="Driver" value={view.bus.driverName} />}
              </dl>
            </Card>
          )}

          {view.state === "running" && (
            <p className="mt-3 text-xs text-slate-400">
              The bus location is shown only while the bus is on its route.
            </p>
          )}
        </>
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
