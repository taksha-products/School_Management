"use client";

import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

import { BusMarker } from "@/components/gps/BusMarker";
import { useGpsTracking, type BusPosition } from "@/hooks/useGpsTracking";
import { api } from "@/lib/api";

interface LiveBusApiRow {
  busId: string;
  busNumber: string;
  routeName: string;
  deviceId: string;
  lat: number | null;
  lng: number | null;
  speed: number | null;
  bearing: number | null;
  lastSeen: string | null;
  batteryLevel: number | null;
}

export interface BusMapEntry extends BusPosition {
  busNumber: string;
  routeName: string;
}

interface LeafletDefaultIconPrototype {
  _getIconUrl?: () => string;
}

// Leaflet default marker paths (tiles use OSM; markers for any default icons)
const iconPrototype = L.Icon.Default.prototype as LeafletDefaultIconPrototype;
delete iconPrototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "/leaflet/marker-icon-2x.png",
  iconUrl: "/leaflet/marker-icon.png",
  shadowUrl: "/leaflet/marker-shadow.png"
});

const toMapEntry = (row: LiveBusApiRow): BusMapEntry | null => {
  if (row.lat === null || row.lng === null) {
    return null;
  }
  return {
    busId: row.busId,
    busNumber: row.busNumber,
    routeName: row.routeName,
    deviceId: row.deviceId,
    organizationId: "",
    lat: row.lat,
    lng: row.lng,
    speed: row.speed ?? 0,
    bearing: row.bearing ?? 0,
    accuracy: 0,
    timestamp: row.lastSeen ?? new Date().toISOString()
  };
};

export const LiveMapClient = (): JSX.Element => {
  const [initialPositions, setInitialPositions] = useState<Map<string, BusMapEntry>>(new Map());
  const [loadError, setLoadError] = useState<string | null>(null);
  const { positions: livePositions, connected } = useGpsTracking(true);

  useEffect(() => {
    const loadInitial = async (): Promise<void> => {
      try {
        const res = await api.get<{ data: LiveBusApiRow[] }>("/api/gps/buses/live");
        const map = new Map<string, BusMapEntry>();
        for (const row of res.data.data) {
          const entry = toMapEntry(row);
          if (entry) {
            map.set(entry.busId, entry);
          }
        }
        setInitialPositions(map);
        setLoadError(null);
      } catch {
        setLoadError("Could not load bus positions");
      }
    };
    void loadInitial();
  }, []);

  const displayedBuses = useMemo(() => {
    const merged = new Map<string, BusMapEntry>(initialPositions);
    livePositions.forEach((pos, busId) => {
      const existing = merged.get(busId);
      merged.set(busId, {
        ...pos,
        busNumber: existing?.busNumber ?? `Bus`,
        routeName: existing?.routeName ?? ""
      });
    });
    return merged;
  }, [initialPositions, livePositions]);

  const busCount = displayedBuses.size;

  return (
    <div className="relative min-h-[calc(100vh-10rem)] flex-1">
      <div className="absolute left-3 top-3 z-[1000] rounded-lg bg-white/95 px-3 py-2 text-sm shadow-md">
        <span className="font-medium">{busCount}</span>{" "}
        {busCount === 1 ? "bus" : "buses"} tracked
      </div>

      <div className="absolute right-3 top-3 z-[1000] flex items-center gap-2 rounded-lg bg-white/95 px-3 py-2 text-sm shadow-md">
        <span
          className={`h-2.5 w-2.5 rounded-full ${connected ? "bg-emerald-500" : "bg-gray-400"}`}
        />
        {connected ? "Live" : "Connecting..."}
      </div>

      {loadError && (
        <div className="absolute bottom-3 left-3 z-[1000] rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 shadow-md">
          {loadError}
        </div>
      )}

      <MapContainer
        center={[20.5937, 78.9629]}
        zoom={5}
        className="h-[calc(100vh-10rem)] w-full rounded-xl border border-slate-200"
        scrollWheelZoom
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {Array.from(displayedBuses.values()).map((bus) => (
          <BusMarker
            key={bus.busId}
            busId={bus.busId}
            busNumber={bus.busNumber}
            lat={bus.lat}
            lng={bus.lng}
            speed={bus.speed}
            bearing={bus.bearing}
            timestamp={bus.timestamp}
          />
        ))}
      </MapContainer>
    </div>
  );
};
