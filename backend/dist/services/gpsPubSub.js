"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.publishGpsPositionUpdate = void 0;
const redis_1 = require("../config/redis");
let publisherClient = null;
const getPublisherClient = () => {
    if (!publisherClient) {
        publisherClient = redis_1.redisClient.duplicate();
    }
    return publisherClient;
};
/**
 * Publishes a live GPS position update to Redis pub/sub (separate connection from cache).
 */
const publishGpsPositionUpdate = async (organizationId, payload) => {
    if (!(0, redis_1.isRedisReady)()) {
        return;
    }
    try {
        const client = getPublisherClient();
        await client.publish(`gps:org:${organizationId}`, JSON.stringify(payload));
    }
    catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        // eslint-disable-next-line no-console
        console.error("GPS pub/sub publish failed:", message);
    }
};
exports.publishGpsPositionUpdate = publishGpsPositionUpdate;
