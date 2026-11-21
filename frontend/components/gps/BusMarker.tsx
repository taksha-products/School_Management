"use client";

import L from "leaflet";
import { useMemo, useState } from "react";
import { Marker, Popup, useMap, useMapEvents } from "react-leaflet";

import {
  BUS_STATUS_META,
  formatLastSeen,
  shortBusLabel,
  type LiveBusStatus
} from "@/lib/busTracking";

/** Top-down school bus, nose pointing up (north). Optimised from the supplied artwork. */
const BUS_IMAGE_SRC = "/images/bus-top.png";
/** Height / width of the artwork. */
const BUS_ASPECT = 250 / 96;

/** From this zoom level the full bus number is printed under the bus as well. */
const FULL_LABEL_MIN_ZOOM = 14;

/** Bus width in px per zoom level, so buses stay readable zoomed out and detailed zoomed in. */
const busWidthForZoom = (zoom: number): number => {
  if (zoom <= 11) return 14;
  if (zoom === 12) return 17;
  if (zoom === 13) return 21;
  if (zoom === 14) return 25;
  if (zoom === 15) return 30;
  return 36;
};

const Z_OFFSET: Record<LiveBusStatus, number> = {
  live: 300,
  stopped: 200,
  offline: 100,
  no_device: 0
};
const SELECTED_Z_OFFSET = 1000;

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

interface BusIconOptions {
  busNumber: string;
  color: string;
  bearing: number;
  busWidth: number;
  offline: boolean;
  selected: boolean;
  showFullNumber: boolean;
}

/**
 * The bus is drawn from the top-down artwork and rotated to its heading. A glow in the
 * status colour follows the bus outline (green moving, orange stopped, grey offline), and
 * an upright number tag below it carries the bus code, so the number never turns upside down.
 */
const createBusDivIcon = (options: BusIconOptions): L.DivIcon => {
  const { busNumber, color, bearing, busWidth, offline, selected, showFullNumber } = options;

  const busHeight = Math.round(busWidth * BUS_ASPECT);
  const scale = selected ? 1.25 : 1;
  const boxWidth = Math.max(busHeight + 16, 120);
  const centerX = boxWidth / 2;
  const centerY = Math.round(busHeight / 2) + 8;
  const tagTop = centerY + Math.round((busHeight * scale) / 2) + 4;
  const boxHeight = tagTop + 24;

  const glow = selected
    ? `drop-shadow(0 0 1.5px ${color}) drop-shadow(0 0 3px ${color}) drop-shadow(0 0 6px ${color})`
    : `drop-shadow(0 0 1.5px ${color}) drop-shadow(0 0 3px ${color})`;
  const imageFilter = offline ? `grayscale(1) ${glow}` : glow;

  const code = escapeHtml(shortBusLabel(busNumber));
  const full = showFullNumber ? escapeHtml(busNumber) : code;

  const html = `
    <div style="position:relative;width:${boxWidth}px;height:${boxHeight}px;font-family:Inter,system-ui,sans-serif;">
      <div class="bus-marker__hit" style="position:absolute;left:${centerX - busWidth / 2}px;top:${centerY - busHeight / 2}px;width:${busWidth}px;height:${busHeight}px;transform:rotate(${bearing}deg) scale(${scale});transform-origin:center;opacity:${offline ? 0.85 : 1};">
        <img src="${BUS_IMAGE_SRC}" alt="" width="${busWidth}" height="${busHeight}" draggable="false" style="display:block;width:100%;height:100%;filter:${imageFilter};" />
      </div>
      <div class="bus-marker__hit" style="position:absolute;left:0;right:0;top:${tagTop}px;display:flex;justify-content:center;">
        <span style="background:#fff;color:#0f172a;border:2px solid ${color};border-radius:7px;padding:1px 7px;font-size:12px;font-weight:800;line-height:17px;white-space:nowrap;letter-spacing:.2px;box-shadow:0 1px 4px rgba(0,0,0,.35);">${full}</span>
      </div>
    </div>`;

  return L.divIcon({
    className: "bus-marker",
    html,
    iconSize: [boxWidth, boxHeight],
    iconAnchor: [centerX, centerY],
    popupAnchor: [0, -Math.round(busHeight / 2)]
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
  selected?: boolean;
  onSelect?: (busId: string) => void;
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
  status,
  selected = false,
  onSelect
}: BusMarkerProps): JSX.Element => {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const meta = BUS_STATUS_META[status];
  const showFullNumber = zoom >= FULL_LABEL_MIN_ZOOM;
  const busWidth = busWidthForZoom(zoom);
  // Round so tiny heading jitter does not rebuild the marker on every update.
  const roundedBearing = Math.round(bearing / 5) * 5;

  const icon = useMemo(
    () =>
      createBusDivIcon({
        busNumber,
        color: meta.color,
        bearing: roundedBearing,
        busWidth,
        offline: status === "offline",
        selected,
        showFullNumber
      }),
    [busNumber, meta.color, roundedBearing, busWidth, status, selected, showFullNumber]
  );

  return (
    <Marker
      position={[lat, lng]}
      icon={icon}
      title={`Bus ${busNumber}`}
      zIndexOffset={Z_OFFSET[status] + (selected ? SELECTED_Z_OFFSET : 0)}
      eventHandlers={{ click: () => onSelect?.(busId) }}
    >
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
