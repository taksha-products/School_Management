"use client";

import "leaflet/dist/leaflet.css";
import { memo, useEffect, useRef, useState, type ReactNode } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";

import { BusMarker } from "@/components/gps/BusMarker";
import { BusTrail } from "@/components/gps/BusTrail";
import { useIsStale } from "@/components/parent/BusStatusPill";
import type { ParentBusPosition } from "@/types/parentBus";

const START_ZOOM = 15;
/** One fixed colour for the path, so a stopped bus does not turn its whole past route orange. */
const TRAIL_COLOR = "#2563eb";
const STALE_TRAIL_COLOR = "#9ca3af";

interface FollowControllerProps {
  position: ParentBusPosition;
  follow: boolean;
  /** Height of the bottom sheet covering the map; the bus is centred in what remains visible. */
  bottomInset: number;
  onUserMove: () => void;
}

/** Keeps the bus in view while "follow" is on; dragging the map switches follow off. */
const FollowController = ({
  position,
  follow,
  bottomInset,
  onUserMove
}: FollowControllerProps): null => {
  const map = useMap();

  useMapEvents({ dragstart: onUserMove });

  useEffect(() => {
    if (!follow) {
      return;
    }
    // Aim half the sheet height below the bus so it sits in the middle of the visible map.
    const target = map.project([position.lat, position.lng], map.getZoom()).add([0, bottomInset / 2]);
    map.panTo(map.unproject(target, map.getZoom()), { animate: true, duration: 1 });
  }, [map, follow, bottomInset, position.lat, position.lng]);

  return null;
};

interface ParentBusMapProps {
  busNumber: string;
  routeNumber: string | null;
  routeName: string;
  position: ParentBusPosition;
  /** Oldest to newest. */
  trail: [number, number][];
  /** Floating controls over the top-left of the map (back button, child switcher). */
  topLeft?: ReactNode;
  /** Bottom sheet over the map (status and details). */
  sheet?: ReactNode;
}

/** Map of one bus: the parent's child's bus, nothing else. */
const ParentBusMapComponent = ({
  busNumber,
  routeNumber,
  routeName,
  position,
  trail,
  topLeft,
  sheet
}: ParentBusMapProps): JSX.Element => {
  const [follow, setFollow] = useState(true);
  // No signal for a while: grey the bus and its trail so it does not look live.
  const stale = useIsStale(position.lastSeen);
  const sheetRef = useRef<HTMLDivElement>(null);
  const [sheetHeight, setSheetHeight] = useState(0);

  // Track the sheet's height (it opens, closes and wraps) so the bus is never hidden behind it.
  useEffect(() => {
    const element = sheetRef.current;
    if (!element) {
      setSheetHeight(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        setSheetHeight(Math.round(entry.contentRect.height));
      }
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [sheet]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-gray-200">
      <MapContainer
        center={[position.lat, position.lng]}
        zoom={START_ZOOM}
        zoomControl={false}
        scrollWheelZoom
        className="h-[calc(100dvh-8rem)] max-h-[760px] min-h-[520px] w-full"
      >
        <ZoomControl position="topright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FollowController
          position={position}
          follow={follow}
          bottomInset={sheetHeight}
          onUserMove={() => setFollow(false)}
        />
        <BusTrail
          points={trail}
          color={stale ? STALE_TRAIL_COLOR : TRAIL_COLOR}
          highlighted
          dimmed={false}
        />
        <BusMarker
          busId={busNumber}
          busNumber={busNumber}
          routeNumber={routeNumber}
          routeName={routeName}
          lat={position.lat}
          lng={position.lng}
          speed={position.speed}
          bearing={position.bearing}
          timestamp={position.lastSeen}
          status={stale ? "offline" : position.status}
        />
      </MapContainer>

      {topLeft && <div className="absolute left-3 top-3 z-[1000]">{topLeft}</div>}

      <button
        type="button"
        aria-pressed={follow}
        onClick={() => setFollow((value) => !value)}
        className="absolute right-3 top-[5.5rem] z-[1000] min-h-[44px] rounded-full bg-white px-4 text-sm font-semibold text-gray-800 shadow-md hover:bg-gray-50 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        {follow ? "Following" : "Follow bus"}
      </button>

      {sheet && (
        <div ref={sheetRef} className="absolute inset-x-0 bottom-0 z-[1000]">
          {sheet}
        </div>
      )}
    </div>
  );
};

/** Memoised: the page re-renders on every data refresh, the map only when its props change. */
export const ParentBusMap = memo(ParentBusMapComponent);
