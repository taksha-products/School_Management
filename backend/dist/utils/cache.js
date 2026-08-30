"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.invalidateOrgSchoolFeesCache = exports.invalidateOrgReportsCache = exports.clearOrgCache = exports.deleteCached = exports.setCached = exports.getCached = exports.orgCacheKey = void 0;
const redis_1 = require("../config/redis");
const KEY_PREFIX = "taksha:";
/**
 * Builds a cache key scoped to an organization.
 * Stored in Redis as `taksha:org:{orgId}:{suffix}`.
 */
const orgCacheKey = (orgId, suffix) => `org:${orgId}:${suffix}`;
exports.orgCacheKey = orgCacheKey;
const toRedisKey = (key) => key.startsWith(KEY_PREFIX) ? key : `${KEY_PREFIX}${key}`;
const scanAndDelete = async (matchPattern) => {
    if (!(0, redis_1.isRedisReady)()) {
        return;
    }
    try {
        let cursor = "0";
        do {
            const [nextCursor, keys] = await redis_1.redisClient.scan(cursor, "MATCH", matchPattern, "COUNT", 100);
            cursor = nextCursor;
            if (keys.length > 0) {
                await redis_1.redisClient.del(...keys);
            }
        } while (cursor !== "0");
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error("Redis SCAN/DEL failed:", message);
    }
};
/**
 * Reads a JSON-serialized value from Redis.
 * Returns null when Redis is unavailable, the key is missing, or parsing fails.
 */
const getCached = async (key) => {
    if (!(0, redis_1.isRedisReady)()) {
        return null;
    }
    try {
        const raw = await redis_1.redisClient.get(toRedisKey(key));
        if (raw === null) {
            return null;
        }
        return JSON.parse(raw);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error("Redis GET failed:", message);
        return null;
    }
};
exports.getCached = getCached;
/**
 * Stores a JSON-serialized value in Redis with a TTL in seconds.
 * No-op when Redis is unavailable.
 */
const setCached = async (key, value, ttlSeconds) => {
    if (!(0, redis_1.isRedisReady)()) {
        return;
    }
    try {
        const payload = JSON.stringify(value);
        await redis_1.redisClient.setex(toRedisKey(key), ttlSeconds, payload);
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error("Redis SETEX failed:", message);
    }
};
exports.setCached = setCached;
/**
 * Deletes a single cache key from Redis.
 * No-op when Redis is unavailable.
 */
const deleteCached = async (key) => {
    if (!(0, redis_1.isRedisReady)()) {
        return;
    }
    try {
        await redis_1.redisClient.del(toRedisKey(key));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error("Redis DEL failed:", message);
    }
};
exports.deleteCached = deleteCached;
/**
 * Deletes all cache keys for an organization using SCAN (never KEYS).
 * Matches `taksha:org:{orgId}:*`.
 */
const clearOrgCache = async (orgId) => {
    await scanAndDelete(`${KEY_PREFIX}org:${orgId}:*`);
};
exports.clearOrgCache = clearOrgCache;
/** Clears cached bus-fee reports after FeePayment or Expense changes. */
const invalidateOrgReportsCache = async (orgId) => {
    await scanAndDelete(`${KEY_PREFIX}org:${orgId}:reports:*`);
};
exports.invalidateOrgReportsCache = invalidateOrgReportsCache;
/** Clears cached school-fee summary after ledger/payment changes. */
const invalidateOrgSchoolFeesCache = async (orgId) => {
    await scanAndDelete(`${KEY_PREFIX}org:${orgId}:school-fees:*`);
};
exports.invalidateOrgSchoolFeesCache = invalidateOrgSchoolFeesCache;
