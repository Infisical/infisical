import { KeyStorePrefixes, KeyStoreTtls, TKeyStoreFactory } from "@app/keystore/keystore";
import { withCache } from "@app/lib/cache/with-cache";
import { logger } from "@app/lib/logger";

import { TEntitlementsResponse, TLicenseClientBackend } from "./license-client-types";

type TEntitlementResolverDep = {
  keyStore: Pick<TKeyStoreFactory, "getItem" | "setItemWithExpiry">;
  backend: TLicenseClientBackend;
};

export type TEntitlementResolver = ReturnType<typeof entitlementResolverFactory>;

export const entitlementResolverFactory = ({ keyStore, backend }: TEntitlementResolverDep) => {
  // Returns null on total failure so the caller falls back to the feature's declared fallback.
  const getEntitlements = async (orgId: string): Promise<TEntitlementsResponse | null> => {
    try {
      return await withCache({
        keyStore,
        key: KeyStorePrefixes.LicenseEntitlements(orgId),
        ttlSeconds: KeyStoreTtls.LicenseEntitlementsInSeconds,
        fetcher: () => backend.fetchEntitlements(orgId)
      });
    } catch (error) {
      logger.error(error, `license-client: failed to resolve entitlements [orgId=${orgId}]`);
      return null;
    }
  };

  return { getEntitlements };
};
