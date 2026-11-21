"use client";

import "leaflet/dist/leaflet.css";
import { Locate, LocateFixed, MapPin } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject, type ReactNode } from "react";
import { MapContainer, TileLayer, useMap, useMapEvents, ZoomControl } from "react-leaflet";

import { BusMarker } from "@/components/gps/BusMarker";
import { BusTrail, BusTrailHead, type TrailHeadHandle } from "@/components/gps/BusTrail";
import { useIsStale } from "@/components/parent/BusStatusPill";
import { useNow } from "@/hooks/useNow";
import { formatAgo } from "@/lib/busTracking";
import type { ParentBusPosition } from "@/types/parentBus";

const START_ZOOM = 15;
/** One fixed colour for the path, so a stopped bus does not turn its whole past route orange. */
const TRAIL_COLOR = "#2563eb";
const STALE_TRAIL_COLOR = "#9ca3af";

type FrameHandler = (lat: number, lng: number) => void;

/** Small label on the map: whether what you see is live, and how fresh it is. Ticks by itself. */
const LiveLocationChip = ({
  lastSeen,
  stale,
  bottom
}: {
  lastSeen: string;
  stale: boolean;
  /** Distance from the map's bottom edge, so it floats just above the bottom sheet. */
  bottom: number;
}): JSX.Element => {
  const now = useNow(10_000);
  return (
    <div
      className="pointer-events-none absolute left-3 z-[1000] flex items-center gap-2 rounded-full bg-white px-3 py-2 shadow-md"
      style={{ bottom: bottom + 12 }}
    >
      <MapPin
        aria-hidden="true"
        className={stale ? "h-5 w-5 text-gray-400" : "h-5 w-5 text-green-600"}
      />
      <div className="leading-tight">
        <p className="text-sm font-bold text-gray-900">{stale ? "Last known location" : "Live Location"}</p>
        <p className="flex items-center gap-1.5 text-xs text-gray-500">
          <span
            aria-hidden="true"
            className={`inline-block h-1.5 w-1.5 rounded-full ${stale ? "bg-gray-400" : "bg-green-500"}`}
          />
          Updated {formatAgo(lastSeen, now)}
        </p>
      </div>
    </div>
  );
};

interface FollowControllerProps {
  follow: boolean;
  /** Height of the bottom sheet covering the map; the bus is centred in what remains visible. */
  bottomInset: number;
  /** Where the bus is drawn right now (updated on every animation frame). */
  displayed: MutableRefObject<[number, number]>;
  /** Filled in here: called for each displayed position while "follow" is on. */
  frameHandler: MutableRefObject<FrameHandler | null>;
  onUserMove: () => void;
}

/**
 * Keeps the bus centred while "follow" is on. The map moves with the gliding bus a little on every
 * frame, so the bus stays put on screen and the streets move under it. Dragging the map turns
 * follow off.
 */
const FollowController = ({
  follow,
  bottomInset,
  displayed,
  frameHandler,
  onUserMove
}: FollowControllerProps): null => {
  const map = useMap();

  useMapEvents({ dragstart: onUserMove });

  const centreOn = useCallback(
    (lat: number, lng: number, animate: boolean): void => {
      const zoom = map.getZoom();
      // Aim half the sheet height below the bus so it sits in the middle of the visible map.
      const target = map.project([lat, lng], zoom).add([0, bottomInset / 2]);
      map.setView(map.unproject(target, zoom), zoom, { animate, duration: 0.6 });
    },
    [map, bottomInset]
  );

  useEffect(() => {
    if (!follow) {
      frameHandler.current = null;
      return undefined;
    }
    // Switching follow on (or the sheet resizing): glide to the bus, then track it frame by frame.
    centreOn(displayed.current[0], displayed.current[1], true);
    frameHandler.current = (lat, lng) => centreOn(lat, lng, false);
    return () => {
      frameHandler.current = null;
    };
  }, [follow, centreOn, displayed, frameHandler]);

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
  // How much of the map the panel covers (phones only) and the panel's own height (the chip floats above it).
  const [sheetHeight, setSheetHeight] = useState(0);
  const [panelHeight, setPanelHeight] = useState(0);

  // The bus glides between reported positions; these let the map and the trail follow it.
  const displayed = useRef<[number, number]>([position.lat, position.lng]);
  const followFrame = useRef<FrameHandler | null>(null);
  const trailHead = useRef<TrailHeadHandle | null>(null);

  // Stored trail up to (not including) the newest point; the head segment ends at the gliding bus.
  const trailBody = useMemo(() => trail.slice(0, -1), [trail]);
  const headAnchor = trail.length >= 2 ? trail[trail.length - 2]! : null;
  const headEnd: [number, number] = useMemo(() => [position.lat, position.lng], [position.lat, position.lng]);

  const handleFrame = useCallback<FrameHandler>((lat, lng) => {
    displayed.current = [lat, lng];
    trailHead.current?.setEnd(lat, lng);
    followFrame.current?.(lat, lng);
  }, []);
  const trailColor = stale ? STALE_TRAIL_COLOR : TRAIL_COLOR;

  // Track the sheet's height (it opens, closes and wraps) so the bus is never hidden behind it.
  useEffect(() => {
    const element = sheetRef.current;
    if (!element) {
      setSheetHeight(0);
      setPanelHeight(0);
      return;
    }
    const observer = new ResizeObserver(([entry]) => {
      if (entry) {
        // From sm up the panel sits below the map, so it never covers the bus.
        const overlays = !window.matchMedia("(min-width: 640px)").matches;
        setSheetHeight(overlays ? Math.round(entry.contentRect.height) : 0);
        setPanelHeight(Math.round(entry.contentRect.height));
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
        className="h-[calc(100dvh-8rem)] min-h-[420px] max-h-[760px] w-full sm:h-[min(62dvh,560px)] sm:min-h-[300px]"
      >
        <ZoomControl position="topright" />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <FollowController
          follow={follow}
          bottomInset={sheetHeight}
          displayed={displayed}
          frameHandler={followFrame}
          onUserMove={() => setFollow(false)}
        />
        <BusTrail points={trailBody} color={trailColor} highlighted dimmed={false} />
        {headAnchor && (
          <BusTrailHead anchor={headAnchor} end={headEnd} color={trailColor} weight={6} handleRef={trailHead} />
        )}
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
          onFrame={handleFrame}
        />
      </MapContainer>

      {topLeft && <div className="absolute left-3 top-3 z-[1000]">{topLeft}</div>}

      <button
        type="button"
        aria-pressed={follow}
        aria-label={follow ? "Following the bus. Tap to stop following" : "Re-centre the map on the bus"}
        onClick={() => setFollow((value) => !value)}
        className={`absolute right-3 top-[5.5rem] z-[1000] inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-semibold shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-slate-900 ${
          follow
            ? "bg-primary text-white hover:opacity-90"
            : "bg-white text-gray-800 hover:bg-gray-50"
        }`}
      >
        {follow ? (
          <LocateFixed aria-hidden="true" className="h-4 w-4" />
        ) : (
          <Locate aria-hidden="true" className="h-4 w-4" />
        )}
        {follow ? "Following" : "Re-centre"}
      </button>

      <LiveLocationChip lastSeen={position.lastSeen} stale={stale} bottom={panelHeight} />

      {sheet && (
        <div ref={sheetRef} className="absolute inset-x-0 bottom-0 z-[1000] sm:static">
          {sheet}
        </div>
      )}
    </div>
  );
};

/** Memoised: the page re-renders on every data refresh, the map only when its props change. */
export const ParentBusMap = memo(ParentBusMapComponent);
