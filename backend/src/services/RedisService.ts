import { Redis } from "ioredis"

export const redisClient = new Redis(process.env.REDIS_URL as string);