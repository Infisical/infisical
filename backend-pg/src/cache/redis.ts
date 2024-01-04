import Redis from "ioredis";

export const initRedisConnection = (redisUrl: string) => {
  const redis = new Redis(redisUrl);
  return redis;
};
