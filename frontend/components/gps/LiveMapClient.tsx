"use client";

import { useQuery } from "@tanstack/react-query";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, useMap, ZoomControl } from "react-leaflet";

import { BusMarker } from "@/components/gps/BusMarker";
import { useGpsTracking } from "@/hooks/useGpsTracking";
import { api } from "@/lib/api";
import {
  BUS_STATUS_META,
  deriveBusStatus,
  formatLastSeen,
  type LiveBusStatus
} from "@/lib/busTracking";
import { cn } from "@/lib/utils";

interface LiveBusApiRow {
  busId: string;
  busNumber: string;
  routeName: string;
  deviceId: string | null;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  bearing: number | null;
  lastSeen: string | null;
  batteryLevel: number | null;
  status: LiveBusStatus;
}

interface BusView {
  busId: string;
  busNumber: string;
  routeName: string;
  hasDevice: boolean;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  bearing: number | null;
  lastSeen: string | null;
  status: LiveBusStatus;
}

const FALLBACK_CENTER: [number, number] = [12.9716, 77.5946];
const FALLBACK_ZOOM = 12;
const STATUS_TICK_MS = 15_000;
const LIST_REFRESH_MS = 60_000;
const STATUS_ORDER: Record<LiveBusStatus, number> = {
  live: 0,
  stopped: 1,
  offline: 2,
  no_device: 3
};

interface MapControllerProps {
  fitPoints: [number, number][];
  fitSignal: number;
  focus: { lat: number; lng: number; nonce: number } | null;
}

/** Fits the map when asked (first load / "Fit all"), and flies to a selected bus. */
const MapController = ({ fitPoints, fitSignal, focus }: MapControllerProps): null => {
  const map = useMap();

  useEffect(() => {
    if (fitPoints.length > 0) {
      map.fitBounds(L.latLngBounds(fitPoints), { padding: [48, 48], maxZoom: 15 });
    }
    // Only re-fit when the signal changes, never on every live update.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, fitSignal]);

  useEffect(() => {
    if (focus) {
      map.flyTo([focus.lat, focus.lng], Math.max(map.getZoom(), 15), { duration: 0.8 });
    }
  }, [map, focus]);

  return null;
};

export const LiveMapClient = (): JSX.Element => {
  const { positions: livePositions, connected } = useGpsTracking(true);
  const [now, setNow] = useState(() => Date.now());
  const [fitSignal, setFitSignal] = useState(0);
  const [hasFitted, setHasFitted] = useState(false);
  const [focus, setFocus] = useState<{ lat: number; lng: number; nonce: number } | null>(null);
  const [selectedBusId, setSelectedBusId] = useState<string | null>(null);

  const busesQuery = useQuery({
    queryKey: ["live-buses"],
    queryFn: async () =>
      (await api.get<{ data: LiveBusApiRow[] }>("/api/gps/buses/live")).data.data,
    refetchInterval: LIST_REFRESH_MS
  });

  // Statuses depend on elapsed time, so re-evaluate them periodically.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), STATUS_TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const buses = useMemo<BusView[]>(() => {
    const merged = (busesQuery.data ?? []).map((row): BusView => {
      const live = livePositions.get(row.busId);
      const hasDevice = row.deviceId !== null;
      const lastSeen = live?.timestamp ?? row.lastSeen;
      const speed = live?.speed ?? row.speed;
      return {
        busId: row.busId,
        busNumber: row.busNumber,
        routeName: row.routeName,
        hasDevice,
        lat: live?.lat ?? row.lat,
        lng: live?.lng ?? row.lng,
        speed,
        bearing: live?.bearing ?? row.bearing,
        lastSeen,
        status: deriveBusStatus({ hasDevice, lastSeen, speed }, now)
      };
    });

    return merged.sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] ||
        a.busNumber.localeCompare(b.busNumber, undefined, { numeric: true })
    );
  }, [busesQuery.data, livePositions, now]);

  const positioned = useMemo(
    () => buses.filter((bus) => bus.lat !== null && bus.lng !== null),
    [buses]
  );
  const fitPoints = useMemo(
    () => positioned.map((bus) => [bus.lat as number, bus.lng as number] as [number, number]),
    [positioned]
  );

  // Fit once, as soon as the first positions are known.
  useEffect(() => {
    if (!hasFitted && fitPoints.length > 0) {
      setHasFitted(true);
      setFitSignal((value) => value + 1);
    }
  }, [hasFitted, fitPoints.length]);

  const movingCount = buses.filter((bus) => bus.status === "live").length;

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="relative min-h-[calc(100vh-10rem)] flex-1">
        <div className="absolute left-3 top-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-sm shadow-md">
          <span className="font-medium">{positioned.length}</span> of{" "}
          <span className="font-medium">{buses.length}</span> buses on map ·{" "}
          <span className="font-medium">{movingCount}</span> moving
        </div>

        <div className="absolute right-3 top-3 z-[1000] flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm shadow-md">
          <span
            className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-gray-400"}`}
          />
          {connected ? "Live" : "Connecting..."}
        </div>

        {fitPoints.length > 0 && (
          <button
            type="button"
            onClick={() => setFitSignal((value) => value + 1)}
            className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-sm font-medium shadow-md hover:bg-white"
          >
            Fit all buses
          </button>
        )}

        {busesQuery.isError && (
          <div className="absolute bottom-14 left-3 z-[1000] rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-md">
            Could not load bus positions
          </div>
        )}

        <MapContainer
          center={FALLBACK_CENTER}
          zoom={FALLBACK_ZOOM}
          zoomControl={false}
          className="h-[calc(100vh-10rem)] w-full rounded-xl border border-slate-200"
          scrollWheelZoom
        >
          <ZoomControl position="bottomright" />
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <MapController fitPoints={fitPoints} fitSignal={fitSignal} focus={focus} />
          {positioned.map((bus) => (
            <BusMarker
              key={bus.busId}
              busId={bus.busId}
              busNumber={bus.busNumber}
              routeName={bus.routeName}
              lat={bus.lat as number}
              lng={bus.lng as number}
              speed={bus.speed ?? 0}
              bearing={bus.bearing ?? 0}
              timestamp={bus.lastSeen}
              status={bus.status}
              selected={selectedBusId === bus.busId}
              onSelect={setSelectedBusId}
            />
          ))}
        </MapContainer>
      </div>

      <aside className="w-full shrink-0 lg:w-80">
        <div className="rounded-xl border border-slate-200 bg-white">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold text-slate-900">
            All buses
          </div>
          {busesQuery.isLoading ? (
            <p className="px-4 py-6 text-sm text-slate-500">Loading buses...</p>
          ) : buses.length === 0 ? (
            <p className="px-4 py-6 text-sm text-slate-500">
              No active buses yet. Add a bus under Transport → Buses.
            </p>
          ) : (
            <ul className="max-h-[calc(100vh-14rem)] divide-y divide-slate-100 overflow-y-auto">
              {buses.map((bus) => {
                const meta = BUS_STATUS_META[bus.status];
                const canFocus = bus.lat !== null && bus.lng !== null;
                return (
                  <li key={bus.busId}>
                    <button
                      type="button"
                      disabled={!canFocus}
                      onClick={() => {
                        setSelectedBusId(bus.busId);
                        setFocus({ lat: bus.lat as number, lng: bus.lng as number, nonce: Date.now() });
                      }}
                      className={cn(
                        "flex w-full items-start justify-between gap-3 px-4 py-3 text-left transition-colors",
                        canFocus ? "hover:bg-slate-50" : "cursor-default opacity-70",
                        selectedBusId === bus.busId && "bg-slate-50"
                      )}
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-medium text-slate-900">
                          {bus.busNumber}
                        </span>
                        <span className="block truncate text-xs text-slate-500">
                          {bus.routeName}
                        </span>
                        <span className="block text-xs text-slate-400">
                          {bus.hasDevice ? formatLastSeen(bus.lastSeen) : "No GPS tracker assigned"}
                        </span>
                      </span>
                      <span
                        className={cn(
                          "mt-0.5 shrink-0 rounded-full px-2.5 py-0.5 text-xs font-medium",
                          meta.badgeClass
                        )}
                      >
                        {meta.label}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </aside>
    </div>
  );
};
