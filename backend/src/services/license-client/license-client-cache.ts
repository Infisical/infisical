import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { logger } from "@app/lib/logger";

import { TEntitlementOrg, TEntitlementsResponse, TLicenseClientBackend } from "./license-client-types";

type TEntitlementResolverDep = {
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  backend: Pick<TLicenseClientBackend, "fetchEntitlements">;
};

export type TEntitlementResolver = ReturnType<typeof entitlementResolverFactory>;

export const entitlementResolverFactory = ({ keyStore, backend }: TEntitlementResolverDep) => {
  const ttlSeconds = KeyStoreTtls.LicenseEntitlementsInSeconds;
  const entitlementsCacheKey = (orgId: string) => KeyStorePrefixes.LicenseEntitlements(orgId);
  const identitySyncedKey = (orgId: string) => KeyStorePrefixes.LicenseEntitlementsIdentitySynced(orgId);

  // The license server learns an org's name/slug from whatever identity a request carries. Entitlement
  // reads are cached per org and most callers (feature checks) send no identity, so a cached read would
  // usually answer without reaching the server and the name/slug would never get there. So the first
  // identity-carrying read in a cache window is sent uncached (delivering the identity); this marker then
  // records that the window's identity has been delivered so later reads can serve from the cache again.
  const identityNeedsSync = async (org: TEntitlementOrg): Promise<boolean> => {
    if (!org.name && !org.slug) {
      return false;
    }
    const alreadySynced = await keyStore.getItem(identitySyncedKey(org.id));
    return !alreadySynced;
  };

  // One uncached read that carries the org's identity to the server, then primes the entitlement cache
  // with the response and marks this window's identity as delivered.
  const fetchForwardingIdentity = async (org: TEntitlementOrg): Promise<TEntitlementsResponse> => {
    const entitlements = await backend.fetchEntitlements(org);
    await keyStore.setItemWithExpiry(entitlementsCacheKey(org.id), ttlSeconds, JSON.stringify(entitlements));
    await keyStore.setItemWithExpiry(identitySyncedKey(org.id), ttlSeconds, "1");
    return entitlements;
  };

  // Returns null on total failure so the caller falls back to the feature's declared fallback.
  const getEntitlements = async (org: TEntitlementOrg): Promise<TEntitlementsResponse | null> => {
    try {
      if (await identityNeedsSync(org)) {
        return await fetchForwardingIdentity(org);
      }

      return await withCache({
        keyStore,
        key: entitlementsCacheKey(org.id),
        ttlSeconds,
        fetcher: () => backend.fetchEntitlements(org)
      });
    } catch (error) {
      logger.error(error, `license-client: failed to resolve entitlements [orgId=${org.id}]`);
      return null;
    }
  };

  // Drop the cached entitlements so the next read reflects a just-committed subscription change
  // instead of waiting out the 30-minute TTL. The license server reconciles asynchronously via
  // its Stripe webhook, so a stale read here is what otherwise makes a removed product linger.
  const invalidateEntitlements = async (orgId: string): Promise<void> => {
    try {
      await keyStore.deleteItem(KeyStorePrefixes.LicenseEntitlements(orgId));
    } catch (error) {
      logger.error(error, `license-client: failed to invalidate entitlements [orgId=${orgId}]`);
    }
  };

  return { getEntitlements, invalidateEntitlements };
};
