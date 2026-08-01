import { io, type Socket } from "socket.io-client";

const resolveBackendUrl = (): string =>
  process.env.NEXT_PUBLIC_BACKEND_URL ?? "http://localhost:5000";

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
