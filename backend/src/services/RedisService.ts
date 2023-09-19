import Redis, { Redis as TRedis } from "ioredis";

let redisClient: TRedis | null;

if (process.env.REDIS_URL) {
  redisClient = new Redis(process.env.REDIS_URL as string);
} else {
  console.warn("Redis URL not set, skipping Redis initialization.");
  redisClient = null;
}

export { redisClient };
