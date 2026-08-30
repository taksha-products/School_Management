import { redisClient, isRedisReady } from "../config/redis";

const ATTEMPT_WINDOW_SECONDS = 10 * 60;
const MAX_ATTEMPTS = 5;
const PENDING_SETUP_TTL_SECONDS = 10 * 60;

const attemptsKey = (userId: string): string => `taksha:2fa:attempts:${userId}`;
const pendingKey = (userId: string): string => `taksha:2fa:pending:${userId}`;

/**
 * Increments 2FA verification attempts and returns whether the limit is exceeded.
 */
export const is2FAAttemptsExceeded = async (userId: string): Promise<boolean> => {
  if (!isRedisReady()) {
    return false;
  }

  const key = attemptsKey(userId);
  const count = await redisClient.incr(key);

  if (count === 1) {
    await redisClient.expire(key, ATTEMPT_WINDOW_SECONDS);
  }

  return count > MAX_ATTEMPTS;
};

/**
 * Clears 2FA attempt counter after successful verification.
 */
export const clear2FAAttempts = async (userId: string): Promise<void> => {
  if (!isRedisReady()) {
    return;
  }
  await redisClient.del(attemptsKey(userId));
};

/**
 * Stores a pending TOTP secret during setup (10-minute TTL).
 */
export const setPendingTotpSecret = async (userId: string, secret: string): Promise<void> => {
  if (!isRedisReady()) {
    throw new Error("Redis is not available for 2FA setup");
  }
  await redisClient.set(pendingKey(userId), secret, "EX", PENDING_SETUP_TTL_SECONDS);
};

/**
 * Retrieves a pending TOTP secret from Redis, or null if expired/missing.
 */
export const getPendingTotpSecret = async (userId: string): Promise<string | null> => {
  if (!isRedisReady()) {
    return null;
  }
  return redisClient.get(pendingKey(userId));
};

/**
 * Deletes the pending TOTP secret after setup completes or is abandoned.
 */
export const deletePendingTotpSecret = async (userId: string): Promise<void> => {
  if (!isRedisReady()) {
    return;
  }
  await redisClient.del(pendingKey(userId));
};
