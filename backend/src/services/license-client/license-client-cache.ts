import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { TEntitlementOrg, TEntitlementsResponse, TLicenseClientBackend } from "./license-client-types";

type TEntitlementResolverDep = {
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry" | "deleteItem">;
  backend: Pick<TLicenseClientBackend, "fetchEntitlements">;
};

export type TEntitlementResolver = ReturnType<typeof entitlementResolverFactory>;

export const entitlementResolverFactory = ({ keyStore, backend }: TEntitlementResolverDep) => {
  // Entitlements are not cached here: the only hot reader is licenseService.getPlan, which caches its
  // projection in LicenseCloudPlan and so only reaches this on an L1 miss. The remaining callers
  // (billing overview, self-hosted sync) are low frequency and want fresh reads, so a direct fetch is
  // simpler and avoids a second cache to keep coherent. Returns null on failure so the caller falls back
  // to the feature's declared default. The org's name/slug ride along on the query params, keeping the
  // license server's copy current.
  const getEntitlements = async (org: TEntitlementOrg): Promise<TEntitlementsResponse | null> => {
    try {
      return await backend.fetchEntitlements(org);
    } catch (error) {
      logger.error(error, `license-client: failed to resolve entitlements [orgId=${org.id}]`);
      return null;
    }
  };

  // Flag the org's license caches for stale-while-revalidate instead of dropping them. After a billing
  // mutation the license server reconciles asynchronously (Stripe webhook), so an immediate hard bust
  // would just re-cache the pre-reconciliation value for a full TTL. With the marker set, reads keep
  // serving the cached value while a background refresh converges the cache once reconciliation lands.
  const markPassThrough = async (orgId: string): Promise<void> => {
    try {
      await keyStore.setItemWithExpiry(
        KeyStorePrefixes.LicenseCachePassThrough(orgId),
        KeyStoreTtls.LicenseCachePassThroughInSeconds,
        "1"
      );
    } catch (error) {
      logger.error(error, `license-client: failed to mark entitlements for revalidation [orgId=${orgId}]`);
    }
  };

  // Hard-drop the projected plan cache so the next read reflects a just-committed change instead of
  // waiting out the TTL. Used by the explicit refresh path (refreshEntitlements); billing mutations use
  // markPassThrough for stale-while-revalidate instead.
  const invalidateEntitlements = async (orgId: string): Promise<void> => {
    try {
      await keyStore.deleteItem(KeyStorePrefixes.LicenseCloudPlan(orgId));
    } catch (error) {
      logger.error(error, `license-client: failed to invalidate entitlements [orgId=${orgId}]`);
    }
  };

  return { getEntitlements, invalidateEntitlements, markPassThrough };
};
