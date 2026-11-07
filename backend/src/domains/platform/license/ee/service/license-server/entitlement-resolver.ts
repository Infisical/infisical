import type { TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";

import { TEntitlementOrg, TEntitlementsResponse, TLicenseClientBackend } from "../../../ce/model/license-server-types";
import { LicenseKeys } from "../../../ce/model/plan-cache-keys";

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

  // Hard-drop the projected plan cache so the next read reflects a just-committed change instead of
  // waiting out the TTL. Used by the explicit refresh path (refreshEntitlements); billing mutations use
  // refreshPlan with afterBillingChange for stale-while-revalidate instead.
  const invalidateEntitlements = async (orgId: string): Promise<void> => {
    try {
      await keyStore.deleteItem(LicenseKeys.cloudPlan(orgId));
    } catch (error) {
      logger.error(error, `license-client: failed to invalidate entitlements [orgId=${orgId}]`);
    }
  };

  return { getEntitlements, invalidateEntitlements };
};
