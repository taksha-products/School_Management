"use client";

import { useMemo } from "react";
import { Polyline } from "react-leaflet";

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
