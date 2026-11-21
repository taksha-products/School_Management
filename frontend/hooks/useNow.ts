"use client";

import { useEffect, useState } from "react";

/**
 * Current time that refreshes on an interval. Keep it inside small components (a clock,
 * a "x min ago" label) so the tick re-renders only them, never a whole page or a map.
 */
export const useNow = (intervalMs: number): number => {
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);

  return now;
};
