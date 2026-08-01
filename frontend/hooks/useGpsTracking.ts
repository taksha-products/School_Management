"use client";

import { useEffect, useState } from "react";

import { connectSocket, disconnectSocket, getSocket } from "@/lib/socket";

export interface BusPosition {
  busId: string;
  deviceId: string;
  organizationId: string;
  lat: number;
  lng: number;
  speed: number;
  bearing: number;
  accuracy: number;
  timestamp: string;
}

interface SocketPositionPayload extends BusPosition {
  type?: string;
}

const isBusPosition = (value: unknown): value is SocketPositionPayload => {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const data = value as Record<string, unknown>;
  return (
    typeof data.busId === "string" &&
    typeof data.deviceId === "string" &&
    typeof data.organizationId === "string" &&
    typeof data.lat === "number" &&
    typeof data.lng === "number" &&
    typeof data.speed === "number" &&
    typeof data.bearing === "number" &&
    typeof data.accuracy === "number" &&
    typeof data.timestamp === "string"
  );
};

export const useGpsTracking = (
  enabled: boolean = true
): { positions: Map<string, BusPosition>; connected: boolean } => {
  const [positions, setPositions] = useState<Map<string, BusPosition>>(new Map());
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const socket = getSocket();
    connectSocket();

    const onConnect = (): void => setConnected(true);
    const onDisconnect = (): void => setConnected(false);
    const onPositionUpdate = (data: unknown): void => {
      if (!isBusPosition(data)) {
        return;
      }
      setPositions((prev) => {
        const next = new Map(prev);
        next.set(data.busId, {
          busId: data.busId,
          deviceId: data.deviceId,
          organizationId: data.organizationId,
          lat: data.lat,
          lng: data.lng,
          speed: data.speed,
          bearing: data.bearing,
          accuracy: data.accuracy,
          timestamp: data.timestamp
        });
        return next;
      });
    };

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("bus_position_update", onPositionUpdate);

    if (socket.connected) {
      setConnected(true);
    }

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("bus_position_update", onPositionUpdate);
      disconnectSocket();
    };
  }, [enabled]);

  return { positions, connected };
};
