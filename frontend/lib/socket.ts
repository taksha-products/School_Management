import { io, type Socket } from "socket.io-client";

/**
 * Where the live-tracking socket connects.
 * - NEXT_PUBLIC_BACKEND_URL set: that address (local development uses http://localhost:5000).
 * - Not set (or empty): the page's own origin, which is how a reverse proxy such as nginx
 *   serves the site and /socket.io on one address, so the login cookie is sent as well.
 */
const resolveBackendUrl = (): string => {
  const configured = process.env.NEXT_PUBLIC_BACKEND_URL?.trim();
  if (configured) {
    return configured;
  }
  return typeof window !== "undefined" ? window.location.origin : "http://localhost:5000";
};

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket) {
    socket = io(resolveBackendUrl(), {
      path: "/socket.io",
      withCredentials: true,
      autoConnect: false
    });
  }
  return socket;
};

export const connectSocket = (): void => {
  getSocket().connect();
};

export const disconnectSocket = (): void => {
  getSocket().disconnect();
};
