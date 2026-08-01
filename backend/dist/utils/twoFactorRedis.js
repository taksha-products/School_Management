"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.deletePendingTotpSecret = exports.getPendingTotpSecret = exports.setPendingTotpSecret = exports.clear2FAAttempts = exports.is2FAAttemptsExceeded = void 0;
const redis_1 = require("../config/redis");
const ATTEMPT_WINDOW_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const PENDING_SETUP_TTL_SECONDS = 10 * 60;
const attemptsKey = (userId) => `bustrack:2fa:attempts:${userId}`;
const pendingKey = (userId) => `bustrack:2fa:pending:${userId}`;
/**
 * Increments 2FA verification attempts and returns whether the limit is exceeded.
 */
const is2FAAttemptsExceeded = async (userId) => {
    if (!(0, redis_1.isRedisReady)()) {
        return false;
    }
    const key = attemptsKey(userId);
    const count = await redis_1.redisClient.incr(key);
    if (count === 1) {
        await redis_1.redisClient.expire(key, ATTEMPT_WINDOW_SECONDS);
    }
    return count > MAX_ATTEMPTS;
};
exports.is2FAAttemptsExceeded = is2FAAttemptsExceeded;
/**
 * Clears 2FA attempt counter after successful verification.
 */
const clear2FAAttempts = async (userId) => {
    if (!(0, redis_1.isRedisReady)()) {
        return;
    }
    await redis_1.redisClient.del(attemptsKey(userId));
};
exports.clear2FAAttempts = clear2FAAttempts;
/**
 * Stores a pending TOTP secret during setup (10-minute TTL).
 */
const setPendingTotpSecret = async (userId, secret) => {
    if (!(0, redis_1.isRedisReady)()) {
        throw new Error("Redis is not available for 2FA setup");
    }
    await redis_1.redisClient.set(pendingKey(userId), secret, "EX", PENDING_SETUP_TTL_SECONDS);
};
exports.setPendingTotpSecret = setPendingTotpSecret;
/**
 * Retrieves a pending TOTP secret from Redis, or null if expired/missing.
 */
const getPendingTotpSecret = async (userId) => {
    if (!(0, redis_1.isRedisReady)()) {
        return null;
    }
    return redis_1.redisClient.get(pendingKey(userId));
};
exports.getPendingTotpSecret = getPendingTotpSecret;
/**
 * Deletes the pending TOTP secret after setup completes or is abandoned.
 */
const deletePendingTotpSecret = async (userId) => {
    if (!(0, redis_1.isRedisReady)()) {
        return;
    }
    await redis_1.redisClient.del(pendingKey(userId));
};
exports.deletePendingTotpSecret = deletePendingTotpSecret;
