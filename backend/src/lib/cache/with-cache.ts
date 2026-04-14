import { TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

type TCacheKeyStore = Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;

/** Read a raw string from Redis, returning null on miss or error. */
const cacheGet = async (keyStore: TCacheKeyStore, key: string, errMsg: string): Promise<string | null> => {
  try {
    return await keyStore.getItem(key);
  } catch (err) {
    logger.warn({ key, err }, `${errMsg} [key=${key}]`);
    return null;
  }
};

/** Write to Redis with the given TTL, swallowing errors. */
const cacheSet = async (
  keyStore: TCacheKeyStore,
  key: string,
  ttlSeconds: number,
  value: string,
  errMsg: string
): Promise<void> => {
  try {
    await keyStore.setItemWithExpiry(key, ttlSeconds, value);
  } catch (err) {
    logger.warn({ key, err }, `${errMsg} [key=${key}]`);
  }
};

/** Apply an optional reviver; returns the revived value or the original if the reviver returns void. */
const applyReviver = <T>(value: T, reviver?: (parsed: T) => T | void): T => {
  if (!reviver) return value;
  const revived = reviver(value);
  return revived === undefined ? value : revived;
};

type TWithCacheOpts<T> = {
  keyStore: TCacheKeyStore;
  key: string;
  /**
   * Cache TTL in seconds. Can be a fixed number, or a function of the fetched
   * result (e.g. to cap the TTL at the nearest expiry time of the data).
   */
  ttlSeconds: number | ((result: T) => number);
  fetcher: () => Promise<T>;
  /**
   * Optional post-parse callback to revive non-JSON-safe fields (e.g. Date
   * objects) on cache hit. Called with the parsed value; may mutate it or
   * return a new value. If it throws, the value is treated as a cache miss.
   */
  reviver?: (parsed: T) => T | void;
};

/**
 * Cache-aside helper: attempts to read from Redis, falls back to the fetcher on miss, Redis I/O failure,
 * or invalid cached JSON, and writes the result back to Redis. Redis write errors are caught and logged
 * — the fetcher is always the source of truth.
 */
export const withCache = async <T>({ keyStore, key, ttlSeconds, fetcher, reviver }: TWithCacheOpts<T>): Promise<T> => {
  const cached = await cacheGet(keyStore, key, "withCache: cache read failed, falling back to fetcher");

  if (cached !== null) {
    try {
      return applyReviver(JSON.parse(cached) as T, reviver);
    } catch (err) {
      logger.warn({ key, err }, `withCache: cache parse failed, falling back to fetcher [key=${key}]`);
    }
  }

  const result = await fetcher();

  const ttl = typeof ttlSeconds === "function" ? ttlSeconds(result) : ttlSeconds;
  await cacheSet(keyStore, key, ttl, JSON.stringify(result), "withCache: cache write failed");

  return result;
};

type TWithCacheFingerprintOpts<T> = {
  keyStore: TCacheKeyStore;
  dataKey: string;
  markerKey: string;
  markerTtlSeconds: number;
  dataTtlSeconds: number;
  fingerprintFetcher: () => Promise<string>;
  dataFetcher: () => Promise<T>;
  /**
   * Optional post-parse callback to revive non-JSON-safe fields (e.g. Date
   * objects) on cache hit. Called with the parsed payload; may mutate it or
   * return a new value. If it throws, the value is treated as a cache miss.
   */
  reviver?: (parsed: T) => T | void;
};

type TCachedData<T> = {
  fingerprint: string;
  payload: T;
};

/**
 * Two-tier cache-aside helper with fingerprint validation:
 * - Short-lived marker (e.g. 10s) tracks recent validation
 * - Long-lived data (e.g. 10m) holds the actual payload + fingerprint
 *
 * On marker hit: serve cached data directly (0 DB reads)
 * On marker miss: compute lightweight fingerprint (1 DB read); if it matches cached data, reset marker and serve; otherwise, full re-fetch
 */
export const withCacheFingerprint = async <T>({
  keyStore,
  dataKey,
  markerKey,
  markerTtlSeconds,
  dataTtlSeconds,
  fingerprintFetcher,
  dataFetcher,
  reviver
}: TWithCacheFingerprintOpts<T>): Promise<T> => {
  const markerValue = await cacheGet(keyStore, markerKey, "withCacheFingerprint: marker read failed");
  const cachedDataStr = await cacheGet(keyStore, dataKey, "withCacheFingerprint: data read failed");

  // Marker + data hit: return cached data directly (fast path, 0 DB reads)
  if (markerValue !== null && cachedDataStr !== null) {
    try {
      const { payload } = JSON.parse(cachedDataStr) as TCachedData<T>;
      return applyReviver(payload, reviver);
    } catch (err) {
      logger.warn(
        { key: dataKey, err },
        `withCacheFingerprint: cached data parse failed, falling back to fingerprint check [key=${dataKey}]`
      );
    }
  }

  // Marker expired or cache miss — compute fingerprint (1 lightweight DB read)
  let currentFingerprint: string;
  try {
    currentFingerprint = await fingerprintFetcher();
  } catch (err) {
    logger.error({ err }, `withCacheFingerprint: fingerprint fetch failed, bypassing cache`);
    return dataFetcher();
  }

  // Data exists and fingerprint matches: reset marker and return (1 DB read total)
  if (cachedDataStr !== null) {
    try {
      const cachedData = JSON.parse(cachedDataStr) as TCachedData<T>;
      if (cachedData.fingerprint === currentFingerprint) {
        await cacheSet(keyStore, markerKey, markerTtlSeconds, "1", "withCacheFingerprint: marker reset failed");
        return applyReviver(cachedData.payload, reviver);
      }
    } catch (err) {
      logger.error(
        { key: dataKey, err },
        `withCacheFingerprint: cached data parse failed, falling back to full fetch [key=${dataKey}]`
      );
    }
  }

  // Fingerprint mismatch or no cached data — full re-fetch
  const result = await dataFetcher();

  await cacheSet(
    keyStore,
    dataKey,
    dataTtlSeconds,
    JSON.stringify({ fingerprint: currentFingerprint, payload: result }),
    "withCacheFingerprint: data write failed"
  );
  await cacheSet(keyStore, markerKey, markerTtlSeconds, "1", "withCacheFingerprint: marker write failed");

  return result;
};
