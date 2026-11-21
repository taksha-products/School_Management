"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef, useState } from "react";
import { Marker, Popup, useMap, useMapEvents } from "react-leaflet";

import { useSmoothMarker } from "@/hooks/useSmoothMarker";
import { BUS_STATUS_META, formatLastSeen, type LiveBusStatus } from "@/lib/busTracking";

/** Top-down school bus, nose pointing up (north). Optimised from the supplied artwork. */
const BUS_IMAGE_SRC = "/images/bus-top.png";
/** Height / width of the artwork. */
const BUS_ASPECT = 250 / 96;

/** Bus width in px per zoom level, so buses stay readable zoomed out and detailed zoomed in. */
const busWidthForZoom = (zoom: number): number => {
  if (zoom <= 11) return 13;
  if (zoom === 12) return 15;
  if (zoom === 13) return 18;
  if (zoom === 14) return 21;
  if (zoom === 15) return 24;
  return 30;
};

/** How long a turn of the bus takes; the rotation glides instead of snapping. */
const TURN_MS = 900;

/** Rotation that reaches `target` from `current` by the shortest way (never spins the long way round). */
const nearestAngle = (current: number, target: number): number =>
  current + ((((target - current) % 360) + 540) % 360) - 180;

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
  /** Text printed on the tag under the bus: the route number, or the registration number. */
  tagText: string;
  color: string;
  bearing: number;
  busWidth: number;
  offline: boolean;
  selected: boolean;
}

/**
 * The bus is drawn from the top-down artwork and rotated to its heading. A glow in the
 * status colour follows the bus outline (green moving, orange stopped, grey offline), and
 * an upright tag below it shows the route number (or the registration number when the bus has
 * no route number), so the text never turns upside down.
 */
const createBusDivIcon = (options: BusIconOptions): L.DivIcon => {
  const { tagText, color, bearing, busWidth, offline, selected } = options;

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

  const label = escapeHtml(tagText);

  const html = `
    <div style="position:relative;width:${boxWidth}px;height:${boxHeight}px;font-family:Inter,system-ui,sans-serif;">
      <div class="bus-marker__hit bus-marker__rot" data-angle="${bearing}" data-scale="${scale}" style="position:absolute;left:${centerX - busWidth / 2}px;top:${centerY - busHeight / 2}px;width:${busWidth}px;height:${busHeight}px;transform:rotate(${bearing}deg) scale(${scale});transform-origin:center;transition:transform ${TURN_MS}ms linear;opacity:${offline ? 0.85 : 1};">
        <img src="${BUS_IMAGE_SRC}" alt="" width="${busWidth}" height="${busHeight}" draggable="false" style="display:block;width:100%;height:100%;filter:${imageFilter};" />
      </div>
      <div class="bus-marker__hit" style="position:absolute;left:0;right:0;top:${tagTop}px;display:flex;justify-content:center;">
        <span style="background:#fff;color:#0f172a;border:2px solid ${color};border-radius:7px;padding:1px 7px;font-size:12px;font-weight:800;line-height:17px;white-space:nowrap;letter-spacing:.2px;box-shadow:0 1px 4px rgba(0,0,0,.35);">${label}</span>
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
  routeNumber?: string | null;
  routeName: string;
  lat: number;
  lng: number;
  speed: number;
  bearing: number;
  timestamp: string | null;
  status: LiveBusStatus;
  selected?: boolean;
  onSelect?: (busId: string) => void;
  /** Called for every displayed position while the bus glides (the map follows it, the trail ends at it). */
  onFrame?: (lat: number, lng: number) => void;
}

export const BusMarker = ({
  busId,
  busNumber,
  routeNumber,
  routeName,
  lat,
  lng,
  speed,
  bearing,
  timestamp,
  status,
  selected = false,
  onSelect,
  onFrame
}: BusMarkerProps): JSX.Element => {
  const map = useMap();
  const [zoom, setZoom] = useState(() => map.getZoom());
  useMapEvents({ zoomend: () => setZoom(map.getZoom()) });

  const markerRef = useRef<L.Marker | null>(null);
  // The marker is moved by useSmoothMarker; the position prop only places it the first time.
  const startPosition = useRef<[number, number]>([lat, lng]);
  useSmoothMarker(markerRef, lat, lng, onFrame);

  const meta = BUS_STATUS_META[status];
  const busWidth = busWidthForZoom(zoom);
  // Round so tiny heading jitter does not turn the bus on every update.
  const tagText = routeNumber?.trim() || busNumber;
  const roundedBearing = Math.round(bearing / 5) * 5;

  // The icon is rebuilt only for things that change its look. A new heading turns the existing
  // bus (below), so the turn is animated instead of the bus being replaced.
  const bearingRef = useRef(roundedBearing);
  bearingRef.current = roundedBearing;

  const icon = useMemo(
    () =>
      createBusDivIcon({
        tagText,
        color: meta.color,
        bearing: bearingRef.current,
        busWidth,
        offline: status === "offline",
        selected
      }),
    [tagText, meta.color, busWidth, status, selected]
  );

  useEffect(() => {
    const element = markerRef.current?.getElement()?.querySelector<HTMLElement>(".bus-marker__rot");
    if (!element) {
      return;
    }
    const current = Number(element.dataset.angle ?? roundedBearing);
    const next = nearestAngle(current, roundedBearing);
    if (next === current) {
      return;
    }
    element.dataset.angle = String(next);
    element.style.transform = `rotate(${next}deg) scale(${element.dataset.scale ?? 1})`;
  }, [roundedBearing, icon]);

  return (
    <Marker
      ref={markerRef}
      position={startPosition.current}
      icon={icon}
      title={routeNumber?.trim() ? `${routeNumber.trim()} · Bus ${busNumber}` : `Bus ${busNumber}`}
      zIndexOffset={Z_OFFSET[status] + (selected ? SELECTED_Z_OFFSET : 0)}
      eventHandlers={{ click: () => onSelect?.(busId) }}
    >
      <Popup>
        <div className="text-sm">
          <p className="font-semibold">
            {routeNumber?.trim() || `Bus ${busNumber}`}
          </p>
          {routeNumber?.trim() && <p className="text-slate-700">Bus {busNumber}</p>}
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
