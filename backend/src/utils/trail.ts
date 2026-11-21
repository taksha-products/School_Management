import type { TrailPoint } from "../types/gps";

/** Points returned per bus; longer tracks are evenly thinned (keeping the newest point). */
export const TRAIL_MAX_POINTS_PER_BUS = 150;

export const thinTrail = (
  points: TrailPoint[],
  maxPoints: number = TRAIL_MAX_POINTS_PER_BUS
): TrailPoint[] => {
  if (points.length <= maxPoints || maxPoints < 2) {
    return points;
  }
  const step = (points.length - 1) / (maxPoints - 1);
  const thinned: TrailPoint[] = [];
  for (let i = 0; i < maxPoints; i += 1) {
    const point = points[Math.round(i * step)];
    if (point) {
      thinned.push(point);
    }
  }
  return thinned;
};
