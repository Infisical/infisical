import type { TDomainKeyStore } from "@app/domains/lib/key-store";

import { TGrandfatheredOrgCache } from "../services/dependencies";

const GrandfatheredOrgKeys = {
  isGrandfathered: (rootOrgId: string) => `agent-vault-grandfathered-org-${rootOrgId}`
};

// Short, because the proxy asks for an org without a plan on every poll and an ending must show up soon after.
const GRANDFATHERED_ORG_TTL_IN_SECONDS = 300;

export class GrandfatheredOrgCache implements TGrandfatheredOrgCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  async read(rootOrgId: string): Promise<boolean | null> {
    const raw = await this.keyStore.getItem(GrandfatheredOrgKeys.isGrandfathered(rootOrgId));
    if (raw === null) return null;
    return raw === "1";
  }

  async write(rootOrgId: string, isGrandfathered: boolean): Promise<void> {
    await this.keyStore.setItemWithExpiry(
      GrandfatheredOrgKeys.isGrandfathered(rootOrgId),
      GRANDFATHERED_ORG_TTL_IN_SECONDS,
      isGrandfathered ? "1" : "0"
    );
  }

  async forget(rootOrgId: string): Promise<void> {
    await this.keyStore.deleteItem(GrandfatheredOrgKeys.isGrandfathered(rootOrgId));
  }
}
