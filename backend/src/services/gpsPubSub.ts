import type Redis from "ioredis";

import { isRedisReady, redisClient } from "../config/redis";
import type { GpsPositionUpdateMessage } from "../types/gps";

let publisherClient: Redis | null = null;

const getPublisherClient = (): Redis => {
  if (!publisherClient) {
    publisherClient = redisClient.duplicate();
  }
  return publisherClient;
};

/**
 * Publishes a live GPS position update to Redis pub/sub (separate connection from cache).
 */
export const publishGpsPositionUpdate = async (
  organizationId: string,
  payload: GpsPositionUpdateMessage
): Promise<void> => {
  if (!isRedisReady()) {
    return;
  }

  try {
    const client = getPublisherClient();
    await client.publish(`gps:org:${organizationId}`, JSON.stringify(payload));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    // eslint-disable-next-line no-console
    console.error("GPS pub/sub publish failed:", message);
  }
};
