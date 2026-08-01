"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIo = exports.initSocketServer = void 0;
const socket_io_1 = require("socket.io");
const redis_1 = require("./redis");
const jwt_1 = require("../utils/jwt");
let io;
const isGpsPositionUpdate = (value) => {
    if (typeof value !== "object" || value === null) {
        return false;
    }
    const data = value;
    return (data.type === "position_update" &&
        typeof data.deviceId === "string" &&
        typeof data.busId === "string" &&
        typeof data.organizationId === "string" &&
        typeof data.lat === "number" &&
        typeof data.lng === "number" &&
        typeof data.speed === "number" &&
        typeof data.bearing === "number" &&
        typeof data.accuracy === "number" &&
        typeof data.timestamp === "string");
};
const extractAccessToken = (socket) => {
    const cookieHeader = socket.handshake.headers.cookie ?? "";
    const tokenMatch = cookieHeader.match(/access_token=([^;]+)/);
    const cookieToken = tokenMatch?.[1];
    const authToken = socket.handshake.auth?.token;
    const handshakeToken = typeof authToken === "string" ? authToken : undefined;
    return cookieToken ?? handshakeToken;
};
const initSocketServer = (httpServer) => {
    const frontendUrl = process.env.FRONTEND_URL ?? "http://localhost:3000";
    io = new socket_io_1.Server(httpServer, {
        cors: {
            origin: frontendUrl,
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
            const payload = (0, jwt_1.verifyAccessToken)(token);
            if (!payload.organizationId) {
                next(new Error("Organization scope required"));
                return;
            }
            socket.data.userId = payload.userId;
            socket.data.organizationId = payload.organizationId;
            socket.data.role = payload.role;
            next();
        }
        catch {
            next(new Error("Invalid token"));
        }
    });
    io.on("connection", (socket) => {
        const { organizationId } = socket.data;
        socket.join(`org:${organizationId}`);
        socket.on("subscribe_bus", (busId) => {
            if (typeof busId !== "string" || !busId.trim()) {
                return;
            }
            socket.join(`bus:${busId}:${organizationId}`);
        });
        socket.on("unsubscribe_bus", (busId) => {
            if (typeof busId !== "string" || !busId.trim()) {
                return;
            }
            socket.leave(`bus:${busId}:${organizationId}`);
        });
    });
    const subscriber = redis_1.redisClient.duplicate();
    void subscriber.psubscribe("gps:org:*").catch((error) => {
        // eslint-disable-next-line no-console
        console.error("Redis GPS subscriber failed to subscribe:", error.message);
    });
    subscriber.on("pmessage", (_pattern, channel, message) => {
        try {
            const orgId = channel.replace("gps:org:", "");
            const parsed = JSON.parse(message);
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
        }
        catch (error) {
            const errMessage = error instanceof Error ? error.message : String(error);
            // eslint-disable-next-line no-console
            console.error("Socket.io GPS broadcast error:", errMessage);
        }
    });
    return io;
};
exports.initSocketServer = initSocketServer;
const getIo = () => {
    if (!io) {
        throw new Error("Socket.io not initialized");
    }
    return io;
};
exports.getIo = getIo;
