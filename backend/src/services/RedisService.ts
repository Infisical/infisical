import Redis, { Redis as TRedis } from "ioredis";
import { logger } from "../utils/logging";

let redisClient: TRedis | null;

export const initRedis = async () => {
  if (process.env.REDIS_URL) {
    redisClient = new Redis(process.env.REDIS_URL as string);
  } else {
    logger.warn("Redis URL not set, skipping Redis initialization.");
    redisClient = null;
  }
}


export { redisClient };
