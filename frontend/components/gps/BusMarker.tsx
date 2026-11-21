"use client";

import L from "leaflet";
import { useMemo } from "react";
import { Marker, Popup } from "react-leaflet";

import { BUS_STATUS_META, formatLastSeen, type LiveBusStatus } from "@/lib/busTracking";

const MARKER_WIDTH = 96;
const BADGE_SIZE = 34;
/** Centre of the badge, used as the map anchor so the bus sits exactly on its position. */
const BADGE_CENTER_Y = 19;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

// Bus glyph (Lucide "bus", ISC licence), drawn in white inside the status-coloured badge.
const BUS_GLYPH = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" xmlns="http://www.w3.org/2000/svg"><path d="M8 6v6"/><path d="M15 6v6"/><path d="M2 12h19.6"/><path d="M18 18h3s.5-1.7.8-2.8c.1-.4.2-.8.2-1.2 0-.4-.1-.8-.2-1.2l-1.4-5C20.1 6.8 19.1 6 18 6H4a2 2 0 0 0-2 2v10h3"/><circle cx="7" cy="18" r="2"/><path d="M9 18h5"/><circle cx="16" cy="18" r="2"/></svg>`;

interface BusIconOptions {
  busNumber: string;
  color: string;
  bearing: number;
  showHeading: boolean;
}

const createBusDivIcon = ({ busNumber, color, bearing, showHeading }: BusIconOptions): L.DivIcon => {
  const label = escapeHtml(busNumber);
  const left = (MARKER_WIDTH - BADGE_SIZE) / 2;
  const ringSize = BADGE_SIZE + 14;

  // Direction arrow orbits the badge; only drawn while the bus is moving.
  const heading = showHeading
    ? `<div style="position:absolute;left:${(MARKER_WIDTH - ringSize) / 2}px;top:${BADGE_CENTER_Y - ringSize / 2}px;width:${ringSize}px;height:${ringSize}px;transform:rotate(${bearing}deg);pointer-events:none;">
         <div style="position:absolute;left:50%;top:-5px;margin-left:-6px;width:0;height:0;border-left:6px solid transparent;border-right:6px solid transparent;border-bottom:10px solid ${color};"></div>
       </div>`
    : "";

  const html = `
    <div style="position:relative;width:${MARKER_WIDTH}px;height:64px;font-family:Inter,system-ui,sans-serif;">
      ${heading}
      <div style="position:absolute;left:${left}px;top:${BADGE_CENTER_Y - BADGE_SIZE / 2}px;width:${BADGE_SIZE}px;height:${BADGE_SIZE}px;border-radius:50%;background:${color};border:2.5px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;">
        ${BUS_GLYPH}
      </div>
      <div style="position:absolute;left:0;right:0;top:${BADGE_CENTER_Y + BADGE_SIZE / 2 + 3}px;display:flex;justify-content:center;">
        <span style="background:#fff;color:#111827;border:1.5px solid ${color};border-radius:6px;padding:1px 6px;font-size:11px;font-weight:700;line-height:16px;white-space:nowrap;box-shadow:0 1px 3px rgba(0,0,0,.25);">${label}</span>
      </div>
    </div>`;

  return L.divIcon({
    className: "",
    html,
    iconSize: [MARKER_WIDTH, 64],
    iconAnchor: [MARKER_WIDTH / 2, BADGE_CENTER_Y],
    popupAnchor: [0, -(BADGE_SIZE / 2 + 4)]
  });
};

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
  const icon = useMemo(
    () =>
      createBusDivIcon({
        busNumber,
        color: meta.color,
        bearing,
        showHeading: status === "live"
      }),
    [busNumber, meta.color, bearing, status]
  );

  return (
    <Marker key={busId} position={[lat, lng]} icon={icon} title={`Bus ${busNumber}`}>
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
