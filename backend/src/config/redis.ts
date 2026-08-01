import Redis from "ioredis";

const REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";

let connectionReady = false;

/** Shared Redis client singleton (lazyConnect — call {@link initRedis} at startup). */
export const redisClient = new Redis(REDIS_URL, {
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableReadyCheck: true
});

redisClient.on("ready", () => {
  connectionReady = true;
  // eslint-disable-next-line no-console
  console.log("Redis connected");
});

redisClient.on("end", () => {
  connectionReady = false;
});

redisClient.on("error", (error: Error) => {
  connectionReady = false;
  // eslint-disable-next-line no-console
  console.error("Redis error:", error.message);
});

/**
 * Returns true when Redis has completed a successful connection and is ready for commands.
 */
export const isRedisReady = (): boolean =>
  connectionReady && redisClient.status === "ready";

/**
 * Establishes the Redis connection on application startup.
 * Logs errors without throwing so the API can run without Redis.
 */
export const initRedis = async (): Promise<void> => {
  try {
    if (redisClient.status === "wait" || redisClient.status === "end") {
      await redisClient.connect();
    }
  } catch (error) {
    connectionReady = false;
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error("Redis connection failed:", message);
  }
};
