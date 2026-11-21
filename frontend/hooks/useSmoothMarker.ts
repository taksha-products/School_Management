"use client";

import type { Marker } from "leaflet";
import { useEffect, useRef, type RefObject } from "react";

/** Shortest and longest time a move between two reported positions is spread over. */
const MIN_MOVE_MS = 800;
const MAX_MOVE_MS = 12_000;
/** A jump further than this (metres) is a gap in the data, not driving: snap instead of gliding. */
const SNAP_DISTANCE_M = 3_000;
/** Moves smaller than this (metres) are GPS noise: no animation needed. */
const MIN_MOVE_M = 0.5;

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Glides a Leaflet marker to each new position instead of jumping.
 *
 * Positions arrive every few seconds (polling or sockets). Each new position starts a straight
 * glide from wherever the marker is *right now* to the new position, lasting as long as the gap
 * since the previous position arrived, so the bus keeps moving until the next update lands.
 *
 * The marker is moved directly (no React re-render per frame). `onFrame` receives each
 * displayed position, so the map can follow the bus and the trail can end at it.
 */
export const useSmoothMarker = (
  markerRef: RefObject<Marker | null>,
  lat: number,
  lng: number,
  onFrame?: (lat: number, lng: number) => void
): void => {
  const lastArrival = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const onFrameRef = useRef(onFrame);
  onFrameRef.current = onFrame;

  useEffect(() => {
    const marker = markerRef.current;
    if (!marker) {
      return undefined;
    }

    const now = performance.now();
    const gap = lastArrival.current === null ? null : now - lastArrival.current;
    lastArrival.current = now;

    const from = marker.getLatLng();
    const distance = from.distanceTo([lat, lng]);

    const show = (la: number, ln: number): void => {
      marker.setLatLng([la, ln]);
      onFrameRef.current?.(la, ln);
    };

    if (
      gap === null ||
      distance < MIN_MOVE_M ||
      distance > SNAP_DISTANCE_M ||
      document.hidden ||
      prefersReducedMotion()
    ) {
      show(lat, lng);
      return undefined;
    }

    const duration = Math.min(MAX_MOVE_MS, Math.max(MIN_MOVE_MS, gap));
    const startLat = from.lat;
    const startLng = from.lng;
    const startedAt = now;

    const step = (time: number): void => {
      const progress = Math.min(1, (time - startedAt) / duration);
      show(startLat + (lat - startLat) * progress, startLng + (lng - startLng) * progress);
      frame.current = progress < 1 ? requestAnimationFrame(step) : null;
    };
    frame.current = requestAnimationFrame(step);

    return () => {
      if (frame.current !== null) {
        cancelAnimationFrame(frame.current);
        frame.current = null;
      }
    };
  }, [markerRef, lat, lng]);
};
