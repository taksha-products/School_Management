"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.initRedis = exports.isRedisReady = exports.redisClient = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
let connectionReady = false;
/** Shared Redis client singleton (lazyConnect — call {@link initRedis} at startup). */
exports.redisClient = new ioredis_1.default(REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableReadyCheck: true
});
exports.redisClient.on("ready", () => {
    connectionReady = true;
    // eslint-disable-next-line no-console
    console.log("Redis connected");
});
exports.redisClient.on("end", () => {
    connectionReady = false;
});
exports.redisClient.on("error", (error) => {
    connectionReady = false;
    // eslint-disable-next-line no-console
    console.error("Redis error:", error.message);
});
/**
 * Returns true when Redis has completed a successful connection and is ready for commands.
 */
const isRedisReady = () => connectionReady && exports.redisClient.status === "ready";
exports.isRedisReady = isRedisReady;
/**
 * Establishes the Redis connection on application startup.
 * Logs errors without throwing so the API can run without Redis.
 */
const initRedis = async () => {
    try {
        if (exports.redisClient.status === "wait" || exports.redisClient.status === "end") {
            await exports.redisClient.connect();
        }
    }
    catch (error) {
        connectionReady = false;
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error("Redis connection failed:", message);
    }
};
exports.initRedis = initRedis;
