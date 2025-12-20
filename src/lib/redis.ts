import Redis from 'ioredis';

const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';

// Prevent multiple instances in development
const globalForRedis = global as unknown as { redis: Redis };

export const redis = globalForRedis.redis || new Redis(redisUrl, {
    maxRetriesPerRequest: null, // Required by BullMQ
});

if (process.env.NODE_ENV !== 'production') globalForRedis.redis = redis;

export default redis;
