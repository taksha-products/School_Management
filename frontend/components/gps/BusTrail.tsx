"use client";

import type L from "leaflet";
import { useCallback, useEffect, useMemo, useRef, type MutableRefObject } from "react";
import { Polyline } from "react-leaflet";

const CASING_COLOR = "#ffffff";

interface BusTrailProps {
  /** Oldest to newest. */
  points: [number, number][];
  color: string;
  /** Selected bus: drawn thicker. */
  highlighted: boolean;
  /** Another bus is selected: draw this trail softer. */
  dimmed: boolean;
}

const FADE_STEPS = 5;

/**
 * Draws a bus's recent track, fading from faint (oldest) to strong (newest) so the
 * direction of travel is obvious. Trails ignore pointer events so they never block markers.
 */
export const BusTrail = ({ points, color, highlighted, dimmed }: BusTrailProps): JSX.Element | null => {
  const segments = useMemo(() => {
    if (points.length < 2) {
      return [];
    }
    const steps = Math.min(FADE_STEPS, points.length - 1);
    const size = (points.length - 1) / steps;
    return Array.from({ length: steps }, (_, step) => {
      const start = Math.floor(step * size);
      const end = Math.min(points.length - 1, Math.floor((step + 1) * size));
      return { index: step, path: points.slice(start, end + 1), fade: (step + 1) / steps };
    });
  }, [points]);

  if (segments.length === 0) {
    return null;
  }

  const weight = highlighted ? 6 : 4;
  const strength = dimmed ? 0.45 : 1;

  return (
    <>
      {/* White outline under the whole path so it stands out on a busy map. */}
      <Polyline
        positions={points}
        interactive={false}
        pathOptions={{
          color: CASING_COLOR,
          weight: weight + 4,
          opacity: 0.65 * strength,
          lineCap: "round",
          lineJoin: "round"
        }}
      />
      {segments.map((segment) => (
        <Polyline
          key={segment.index}
          positions={segment.path}
          interactive={false}
          pathOptions={{
            color,
            weight,
            opacity: (0.18 + 0.72 * segment.fade) * strength,
            lineCap: "round",
            lineJoin: "round"
          }}
        />
      ))}
    </>
  );
};

export interface TrailHeadHandle {
  /** Moves the free end of the head segment to the bus's displayed position. */
  setEnd: (lat: number, lng: number) => void;
}

interface BusTrailHeadProps {
  /** Last point of the stored trail: the bus was here when its current glide started. */
  anchor: [number, number];
  /** Where the bus is heading (its latest reported position). */
  end: [number, number];
  color: string;
  weight: number;
  handleRef: MutableRefObject<TrailHeadHandle | null>;
}

/**
 * The newest piece of the trail, from the last stored point to the bus as it is drawn right now.
 * Its end is moved directly on every animation frame, so the line stops at the gliding bus
 * instead of running ahead to the latest reported position.
 */
export const BusTrailHead = ({ anchor, end, color, weight, handleRef }: BusTrailHeadProps): JSX.Element => {
  const casing = useRef<L.Polyline | null>(null);
  const line = useRef<L.Polyline | null>(null);
  const anchorRef = useRef(anchor);
  const displayed = useRef<[number, number]>(end);
  // Only used to draw the first frame; later positions are set through the refs.
  const initial = useRef<[number, number][]>([anchor, end]);

  const apply = useCallback((): void => {
    const path: [number, number][] = [anchorRef.current, displayed.current];
    casing.current?.setLatLngs(path);
    line.current?.setLatLngs(path);
  }, []);

  useEffect(() => {
    anchorRef.current = anchor;
    apply();
  }, [anchor, apply]);

  useEffect(() => {
    handleRef.current = {
      setEnd: (lat, lng) => {
        displayed.current = [lat, lng];
        apply();
      }
    };
    return () => {
      handleRef.current = null;
    };
  }, [apply, handleRef]);

  const casingStyle = useMemo(
    () => ({ color: CASING_COLOR, weight: weight + 4, opacity: 0.65, lineCap: "round" as const, lineJoin: "round" as const }),
    [weight]
  );
  const lineStyle = useMemo(
    () => ({ color, weight, opacity: 0.9, lineCap: "round" as const, lineJoin: "round" as const }),
    [color, weight]
  );

  return (
    <>
      <Polyline ref={casing} positions={initial.current} interactive={false} pathOptions={casingStyle} />
      <Polyline ref={line} positions={initial.current} interactive={false} pathOptions={lineStyle} />
    </>
  );
};
