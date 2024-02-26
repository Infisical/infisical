import { Redis } from "ioredis";

export type TKeyStoreFactory = ReturnType<typeof keyStoreFactory>;

export const keyStoreFactory = (redisUrl: string) => {
  const redis = new Redis(redisUrl);

  const setItem = async (key: string, value: string | number | Buffer) => redis.set(key, value);

  const getItem = async (key: string) => redis.get(key);

  const setItemWithExpiry = async (key: string, exp: number | string, value: string | number | Buffer) =>
    redis.setex(key, exp, value);

  const deleteItem = async (key: string) => redis.del(key);

  return { setItem, getItem, setItemWithExpiry, deleteItem };
};
