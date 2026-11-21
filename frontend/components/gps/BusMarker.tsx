"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";

import { BUS_STATUS_META, formatLastSeen, type LiveBusStatus } from "@/lib/busTracking";

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
  routeName: string;
  lat: number;
  lng: number;
  speed: number;
  bearing: number;
  timestamp: string | null;
  status: LiveBusStatus;
}

export const BusMarker = ({
  busId,
  busNumber,
  routeName,
  lat,
  lng,
  speed,
  bearing,
  timestamp,
  status
}: BusMarkerProps): JSX.Element => {
  const meta = BUS_STATUS_META[status];
  const icon = useMemo(() => createBusDivIcon(bearing, meta.color), [bearing, meta.color]);

  return (
    <Marker key={busId} position={[lat, lng]} icon={icon}>
      <Popup>
        <div className="text-sm">
          <p className="font-semibold">Bus {busNumber}</p>
          {routeName && <p className="text-slate-500">{routeName}</p>}
          <p>
            {meta.label}
            {status === "live" ? ` · ${speed.toFixed(1)} km/h` : ""}
          </p>
          <p className="text-slate-500">Updated: {formatLastSeen(timestamp)}</p>
        </div>
      </Popup>
    </Marker>
  );
};
