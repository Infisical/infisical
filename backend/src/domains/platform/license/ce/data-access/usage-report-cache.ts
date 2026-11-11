import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { applyJitter } from "@app/lib/dates";

import { TUsageReportCache } from "../service/dependencies";

// Key names and TTLs match the old pods' so a rolling deploy reads what they wrote.
const UsageKeys = {
  reconcileMarker: (orgId: string) => `license-usage-reconcile-${orgId}`,
  lastReported: (reportOrgId: string, meterKey: string) => `license-usage-last-reported-${reportOrgId}-${meterKey}`
};

const UsageKeyTtls = {
  reconcileIntervalInSeconds: 21600,
  lastReportedInSeconds: 604800
};

// Remembers what we last reported so an unchanged value doesn't get sent again.
export class UsageReportCache implements TUsageReportCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  // Once per interval per org; the jitter keeps a cold start from expiring every marker together.
  async acquireReconcileMarker(orgId: string) {
    const acquired = await this.keyStore.setItemWithExpiryNX(
      UsageKeys.reconcileMarker(orgId),
      applyJitter(UsageKeyTtls.reconcileIntervalInSeconds, 1800),
      "1"
    );
    return acquired === "OK";
  }

  async isReconciled(orgId: string) {
    const [marker] = await this.keyStore.getItems([UsageKeys.reconcileMarker(orgId)]);
    return Boolean(marker);
  }

  async lastReported(reportOrgId: string, meterKey: string) {
    const [raw] = await this.keyStore.getItems([UsageKeys.lastReported(reportOrgId, meterKey)]);
    return raw === null ? null : Number(raw);
  }

  async recordReported(reportOrgId: string, meterKey: string, value: number) {
    await this.keyStore.setItemWithExpiry(
      UsageKeys.lastReported(reportOrgId, meterKey),
      UsageKeyTtls.lastReportedInSeconds,
      String(value)
    );
  }
}
