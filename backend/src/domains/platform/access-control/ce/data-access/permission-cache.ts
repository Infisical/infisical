import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { withCacheFingerprint } from "@app/lib/cache/with-cache";

// The data lives for ten minutes; it is served without a database read for ten seconds after it was last
// validated, then revalidated against a fingerprint of everything it was built from.
const MARKER_TTL_SECONDS = 10;
const DATA_TTL_SECONDS = 600;

// The Postgres counter row expiry. It must comfortably outlive the cached data: an expired counter reads as 0
// and the next bump writes 1 again, which could match a fingerprint taken before it expired.
const VERSION_TTL = "2d";

const dataKey = (key: string) => `access-control:permission:data:${key}`;
const markerKey = (key: string) => `access-control:permission:marker:${key}`;
const versionKey = (name: string) => `access-control:version:${name}`;

export type TPermissionCacheEntry<T> = {
  key: string;
  fingerprint: () => Promise<string>;
  compute: () => Promise<T>;
  // Restores what JSON loses, such as dates, on a cache hit.
  revive?: (cached: T) => T;
};

export type TPermissionCache = {
  getOrCompute<T>(entry: TPermissionCacheEntry<T>): Promise<T>;
  bumpVersion(name: string): Promise<void>;
  getVersion(name: string): Promise<number>;
};

export class PermissionCache implements TPermissionCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  getOrCompute<T>({ key, fingerprint, compute, revive }: TPermissionCacheEntry<T>): Promise<T> {
    return withCacheFingerprint<T>({
      keyStore: this.keyStore,
      dataKey: dataKey(key),
      markerKey: markerKey(key),
      markerTtlSeconds: MARKER_TTL_SECONDS,
      dataTtlSeconds: DATA_TTL_SECONDS,
      fingerprintFetcher: fingerprint,
      dataFetcher: compute,
      reviver: revive
    });
  }

  async bumpVersion(name: string): Promise<void> {
    await this.keyStore.pgIncrementBy(versionKey(name), { incr: 1, expiry: VERSION_TTL });
  }

  async getVersion(name: string): Promise<number> {
    return (await this.keyStore.pgGetIntItem(versionKey(name))) ?? 0;
  }
}
