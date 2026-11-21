"use client";

import "leaflet/dist/leaflet.css";
import { memo, useEffect, useState, type ReactNode } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";

import { BusMarker } from "@/components/gps/BusMarker";
import { BusTrail } from "@/components/gps/BusTrail";
import type { ParentBusPosition } from "@/types/parentBus";

const START_ZOOM = 15;
/** One fixed colour for the path, so a stopped bus does not turn its whole past route orange. */
const TRAIL_COLOR = "#2563eb";

interface FollowControllerProps {
  position: ParentBusPosition;
  follow: boolean;
  onUserMove: () => void;
}

/** Keeps the bus in view while "follow" is on; dragging the map switches follow off. */
const FollowController = ({ position, follow, onUserMove }: FollowControllerProps): null => {
  const map = useMap();

  useMapEvents({ dragstart: onUserMove });

  useEffect(() => {
    if (follow) {
      map.panTo([position.lat, position.lng], { animate: true, duration: 1 });
    }
  }, [map, follow, position.lat, position.lng]);

  return null;
};

interface ParentBusMapProps {
  busNumber: string;
  routeNumber: string | null;
  routeName: string;
  position: ParentBusPosition;
  /** Oldest to newest. */
  trail: [number, number][];
  /** Shown over the top-left corner of the map (status chip). */
  overlay?: ReactNode;
}

/** Map of one bus: the parent's child's bus, nothing else. */
const ParentBusMapComponent = ({
  busNumber,
  routeNumber,
  routeName,
  position,
  trail,
  overlay
}: ParentBusMapProps): JSX.Element => {
  const [follow, setFollow] = useState(true);

  return (
    <div className="relative">
      <MapContainer
        center={[position.lat, position.lng]}
        zoom={START_ZOOM}
        zoomControl={false}
        scrollWheelZoom
        className="h-[58dvh] max-h-[640px] min-h-[320px] w-full rounded-xl border border-slate-200"
      >
        <ZoomControl position="bottomright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FollowController position={position} follow={follow} onUserMove={() => setFollow(false)} />
        <BusTrail points={trail} color={TRAIL_COLOR} highlighted dimmed={false} />
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
          status={position.status}
        />
      </MapContainer>

      {overlay && <div className="absolute left-3 top-3 z-[1000]">{overlay}</div>}

      <button
        type="button"
        aria-pressed={follow}
        onClick={() => setFollow((value) => !value)}
        className="absolute bottom-3 left-3 z-[1000] min-h-[44px] rounded-lg bg-white/95 px-4 text-sm font-medium shadow-md hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900"
      >
        {follow ? "Following the bus" : "Follow the bus"}
      </button>
    </div>
  );
};

/** Memoised: the page re-renders on every data refresh, the map only when its props change. */
export const ParentBusMap = memo(ParentBusMapComponent);
