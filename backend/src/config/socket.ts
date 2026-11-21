import type { Server as HttpServer } from "http";

import { Server as SocketServer, type Socket } from "socket.io";

import { getAllowedOrigins } from "./cors";
import { redisClient } from "./redis";
import type { GpsPositionUpdateMessage } from "../types/gps";
import { verifyAccessToken } from "../utils/jwt";

let io: SocketServer | undefined;

const isGpsPositionUpdate = (value: unknown): value is GpsPositionUpdateMessage => {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const data = value as Record<string, unknown>;
  return (
    data.type === "position_update" &&
    typeof data.deviceId === "string" &&
    typeof data.busId === "string" &&
    typeof data.organizationId === "string" &&
    typeof data.lat === "number" &&
    typeof data.lng === "number" &&
    typeof data.speed === "number" &&
    typeof data.bearing === "number" &&
    typeof data.accuracy === "number" &&
    typeof data.timestamp === "string"
  );
};

const extractAccessToken = (socket: Socket): string | undefined => {
  const cookieHeader = socket.handshake.headers.cookie ?? "";
  const tokenMatch = cookieHeader.match(/access_token=([^;]+)/);
  const cookieToken = tokenMatch?.[1];

  const authToken = socket.handshake.auth?.token;
  const handshakeToken = typeof authToken === "string" ? authToken : undefined;

  return cookieToken ?? handshakeToken;
};

export const initSocketServer = (httpServer: HttpServer): SocketServer => {
  const allowedOrigins = getAllowedOrigins();

  io = new SocketServer(httpServer, {
    cors: {
      origin: allowedOrigins,
      credentials: true
    },
    path: "/socket.io"
  });

  io.use(async (socket, next) => {
    try {
      const token = extractAccessToken(socket);
      if (!token) {
        next(new Error("Authentication required"));
        return;
      }

      const payload = verifyAccessToken(token);
      if (!payload.organizationId) {
        next(new Error("Organization scope required"));
        return;
      }

      socket.data.userId = payload.userId;
      socket.data.organizationId = payload.organizationId;
      socket.data.role = payload.role;
      next();
    } catch {
      next(new Error("Invalid token"));
    }
  });

  io.on("connection", (socket: Socket) => {
    const { organizationId, role } = socket.data;

    // Only school staff may watch the whole fleet. Parents get no live data here until
    // a per-child subscription (scoped to their children's buses) is added.
    const canViewFleet = role === "orgAdmin" || role === "staff" || role === "superAdmin";
    if (!canViewFleet) {
      return;
    }

    socket.join(`org:${organizationId}`);

    socket.on("subscribe_bus", (busId: string) => {
      if (typeof busId !== "string" || !busId.trim()) {
        return;
      }
      socket.join(`bus:${busId}:${organizationId}`);
    });

    socket.on("unsubscribe_bus", (busId: string) => {
      if (typeof busId !== "string" || !busId.trim()) {
        return;
      }
      socket.leave(`bus:${busId}:${organizationId}`);
    });
  });

  const subscriber = redisClient.duplicate();

  void subscriber.psubscribe("gps:org:*").catch((error: Error) => {
    // eslint-disable-next-line no-console
    console.error("Redis GPS subscriber failed to subscribe:", error.message);
  });

  subscriber.on("pmessage", (_pattern: string, channel: string, message: string) => {
    try {
      const orgId = channel.replace("gps:org:", "");
      const parsed: unknown = JSON.parse(message);

      if (!isGpsPositionUpdate(parsed)) {
        return;
      }

      if (parsed.organizationId !== orgId) {
        // eslint-disable-next-line no-console
        console.warn("GPS message org mismatch — dropped", { channel, orgId });
        return;
      }

      io?.to(`org:${orgId}`).emit("bus_position_update", parsed);

      if (parsed.busId) {
        io?.to(`bus:${parsed.busId}:${orgId}`).emit("bus_position_update", parsed);
      }
    } catch (error) {
      const errMessage = error instanceof Error ? error.message : String(error);
      // eslint-disable-next-line no-console
      console.error("Socket.io GPS broadcast error:", errMessage);
    }
  });

  return io;
};

export const getIo = (): SocketServer => {
  if (!io) {
    throw new Error("Socket.io not initialized");
  }
  return io;
};
