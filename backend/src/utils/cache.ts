import { isRedisReady, redisClient } from "../config/redis";

const KEY_PREFIX = "bustrack:";

/**
 * Builds a cache key scoped to an organization.
 * Stored in Redis as `bustrack:org:{orgId}:{suffix}`.
 */
export const orgCacheKey = (orgId: string, suffix: string): string => `org:${orgId}:${suffix}`;

const toRedisKey = (key: string): string =>
  key.startsWith(KEY_PREFIX) ? key : `${KEY_PREFIX}${key}`;

const scanAndDelete = async (matchPattern: string): Promise<void> => {
  if (!isRedisReady()) {
    return;
  }

  try {
    let cursor = "0";

    do {
      const [nextCursor, keys] = await redisClient.scan(cursor, "MATCH", matchPattern, "COUNT", 100);
      cursor = nextCursor;

      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
    } while (cursor !== "0");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error("Redis SCAN/DEL failed:", message);
  }
};

/**
 * Reads a JSON-serialized value from Redis.
 * Returns null when Redis is unavailable, the key is missing, or parsing fails.
 */
export const getCached = async <T>(key: string): Promise<T | null> => {
  if (!isRedisReady()) {
    return null;
  }

  try {
    const raw = await redisClient.get(toRedisKey(key));
    if (raw === null) {
      return null;
    }
    return JSON.parse(raw) as T;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error("Redis GET failed:", message);
    return null;
  }
};

/**
 * Stores a JSON-serialized value in Redis with a TTL in seconds.
 * No-op when Redis is unavailable.
 */
export const setCached = async (
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> => {
  if (!isRedisReady()) {
    return;
  }

  try {
    const payload = JSON.stringify(value);
    await redisClient.setex(toRedisKey(key), ttlSeconds, payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error("Redis SETEX failed:", message);
  }
};

/**
 * Deletes a single cache key from Redis.
 * No-op when Redis is unavailable.
 */
export const deleteCached = async (key: string): Promise<void> => {
  if (!isRedisReady()) {
    return;
  }

  try {
    await redisClient.del(toRedisKey(key));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error("Redis DEL failed:", message);
  }
};

/**
 * Deletes all cache keys for an organization using SCAN (never KEYS).
 * Matches `bustrack:org:{orgId}:*`.
 */
export const clearOrgCache = async (orgId: string): Promise<void> => {
  await scanAndDelete(`${KEY_PREFIX}org:${orgId}:*`);
};

/** Clears cached bus-fee reports after FeePayment or Expense changes. */
export const invalidateOrgReportsCache = async (orgId: string): Promise<void> => {
  await scanAndDelete(`${KEY_PREFIX}org:${orgId}:reports:*`);
};

/** Clears cached school-fee summary after ledger/payment changes. */
export const invalidateOrgSchoolFeesCache = async (orgId: string): Promise<void> => {
  await scanAndDelete(`${KEY_PREFIX}org:${orgId}:school-fees:*`);
};
