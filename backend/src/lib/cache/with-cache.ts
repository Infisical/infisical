import { TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

type TWithCacheOpts<T> = {
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
  key: string;
  ttlSeconds: number;
  fetcher: () => Promise<T>;
};

/**
 * Cache-aside helper: attempts to read from Redis, falls back to the fetcher on miss or Redis failure,
 * and writes the result back to Redis. Redis errors are caught and logged — the fetcher is always the
 * source of truth.
 */
export const withCache = async <T>({ keyStore, key, ttlSeconds, fetcher }: TWithCacheOpts<T>): Promise<T> => {
  try {
    const cached = await keyStore.getItem(key);
    if (cached !== null) {
      return JSON.parse(cached) as T;
    }
  } catch (err) {
    logger.warn({ key, err }, `withCache: cache read failed, falling back to fetcher [key=${key}]`);
  }

  const result = await fetcher();

  try {
    await keyStore.setItemWithExpiry(key, ttlSeconds, JSON.stringify(result));
  } catch (err) {
    logger.warn({ key, err }, `withCache: cache write failed [key=${key}]`);
  }

  return result;
};
