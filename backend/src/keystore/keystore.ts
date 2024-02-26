import { Redis } from "ioredis";

export type TKeyStoreFactory = ReturnType<typeof keyStoreFactory>;

export const keyStoreFactory = (redisUrl: string) => {
  const redis = new Redis(redisUrl);

  const setItem = async (key: string, value: string | number | Buffer) => redis.set(key, value);

  const getItem = async (key: string) => redis.get(key);

  return { setItem, getItem };
};
