"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";

const OFFLINE_THRESHOLD_MS = 2 * 60 * 1000;

const markerColor = (speed: number, timestamp: string): string => {
  const age = Date.now() - new Date(timestamp).getTime();
  if (Number.isNaN(age) || age > OFFLINE_THRESHOLD_MS) {
    return "#6b7280";
  }
  if (speed > 0) {
    return "#16a34a";
  }
  return "#ea580c";
};

const createBusDivIcon = (bearing: number, color: string): L.DivIcon =>
  L.divIcon({
    className: "",
    html: `<div style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;transform:rotate(${bearing}deg);">
      <svg width="28" height="28" viewBox="0 0 24 24" fill="${color}" xmlns="http://www.w3.org/2000/svg">
        <path d="M12 2L4 20h16L12 2z"/>
      </svg>
    </div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });

export interface BusMarkerProps {
  busId: string;
  busNumber: string;
  lat: number;
  lng: number;
  speed: number;
  bearing: number;
  timestamp: string;
}

export const BusMarker = ({
  busId,
  busNumber,
  lat,
  lng,
  speed,
  bearing,
  timestamp
}: BusMarkerProps): JSX.Element => {
  const icon = useMemo(
    () => createBusDivIcon(bearing, markerColor(speed, timestamp)),
    [bearing, speed, timestamp]
  );

  const updatedLabel = useMemo(() => {
    const date = new Date(timestamp);
    return Number.isNaN(date.getTime())
      ? "—"
      : date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
  }, [timestamp]);

  return (
    <Marker key={busId} position={[lat, lng]} icon={icon}>
      <Popup>
        <div className="text-sm">
          <p className="font-semibold">Bus {busNumber}</p>
          <p>Speed: {speed.toFixed(1)} km/h</p>
          <p className="text-slate-500">Updated: {updatedLabel}</p>
        </div>
      </Popup>
    </Marker>
  );
};
