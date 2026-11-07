import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { applyJitter } from "@app/lib/dates";

import { TPlan } from "../model/plan";
import { LicenseKeys, LicenseKeyTtls } from "../model/plan-cache-keys";

export const jitteredPlanTtl = () => applyJitter(LicenseKeyTtls.cloudPlanInSeconds, 90);

// The cloud plan cache. Every key is the root org's, since the License Server answers for the root.
export class PlanCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  async read(rootOrgId: string, orgId: string) {
    const [plan, passThrough, reconcileMarker] = await this.keyStore.getItems([
      LicenseKeys.cloudPlan(rootOrgId),
      LicenseKeys.passThrough(rootOrgId),
      LicenseKeys.usageReconcileMarker(orgId)
    ]);
    return {
      plan: plan ? (JSON.parse(plan) as TPlan) : null,
      passThrough: Boolean(passThrough),
      isReconciled: Boolean(reconcileMarker)
    };
  }

  async write(rootOrgId: string, plan: TPlan) {
    await this.keyStore.setItemWithExpiry(LicenseKeys.cloudPlan(rootOrgId), jitteredPlanTtl(), JSON.stringify(plan));
    await this.keyStore.setItemWithExpiry(
      LicenseKeys.cloudPlanLastKnown(rootOrgId),
      LicenseKeyTtls.cloudPlanLastKnownInSeconds,
      JSON.stringify({ plan, fetchedAt: Date.now() })
    );
    await this.keyStore.deleteItem(LicenseKeys.cloudPlanFallback(rootOrgId));
  }

  async writeFallback(key: string, plan: TPlan) {
    const ttl = jitteredPlanTtl();
    await this.keyStore.setItemWithExpiry(LicenseKeys.cloudPlan(key), ttl, JSON.stringify(plan));
    await this.keyStore.setItemWithExpiry(LicenseKeys.cloudPlanFallback(key), ttl, "1");
  }

  async isFallback(rootOrgId: string) {
    const [marker] = await this.keyStore.getItems([LicenseKeys.cloudPlanFallback(rootOrgId)]);
    return Boolean(marker);
  }

  async lastKnown(rootOrgId: string) {
    const [raw] = await this.keyStore.getItems([LicenseKeys.cloudPlanLastKnown(rootOrgId)]);
    return raw ? (JSON.parse(raw) as { plan: TPlan; fetchedAt: number }) : null;
  }

  // After a billing change the License Server settles asynchronously (a Stripe webhook), so reads keep the
  // cached plan while a background refresh converges. A hosted checkout applies only once the customer
  // finishes it, so it gets the longer window.
  async markForRevalidation(rootOrgId: string, checkout: boolean) {
    await this.keyStore.setItemWithExpiry(
      LicenseKeys.passThrough(rootOrgId),
      checkout ? LicenseKeyTtls.passThroughCheckoutInSeconds : LicenseKeyTtls.passThroughInSeconds,
      "1"
    );
  }

  async invalidate(rootOrgId: string) {
    await this.keyStore.deleteItem(LicenseKeys.cloudPlan(rootOrgId));
  }

  // Single-flight for a background revalidation: only the caller that sets the lock refreshes.
  async acquireRevalidateLock(rootOrgId: string) {
    const acquired = await this.keyStore.setItemWithExpiryNX(
      LicenseKeys.revalidateLock(rootOrgId),
      LicenseKeyTtls.revalidateLockInSeconds,
      "1"
    );
    return acquired === "OK";
  }

  // Once per interval per org; the jitter keeps a cold start from expiring every marker together.
  async acquireReconcileMarker(orgId: string) {
    const acquired = await this.keyStore.setItemWithExpiryNX(
      LicenseKeys.usageReconcileMarker(orgId),
      applyJitter(LicenseKeyTtls.usageReconcileIntervalInSeconds, 1800),
      "1"
    );
    return acquired === "OK";
  }

  async lastReported(reportOrgId: string, dimensionKey: string) {
    const [raw] = await this.keyStore.getItems([LicenseKeys.usageLastReported(reportOrgId, dimensionKey)]);
    return raw === null ? null : Number(raw);
  }

  async recordReported(reportOrgId: string, dimensionKey: string, value: number) {
    await this.keyStore.setItemWithExpiry(
      LicenseKeys.usageLastReported(reportOrgId, dimensionKey),
      LicenseKeyTtls.usageLastReportedInSeconds,
      String(value)
    );
  }
}
