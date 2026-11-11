import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { applyJitter } from "@app/lib/dates";

import { Plan, TPlanProps } from "../model/plan";
import { TPlanCache } from "../service/dependencies";

// Key names and TTLs match the old pods' so a rolling deploy shares the cache. Keys are always the root org's
// since the License Server answers for the root.
const PlanKeys = {
  plan: (rootOrgId: string) => `infisical-cloud-plan-${rootOrgId}`,
  // Set alongside the community plan cached when the License Server fails, so callers can tell it from a
  // real answer.
  fallback: (rootOrgId: string) => `infisical-cloud-plan-fallback-${rootOrgId}`,
  lastKnown: (rootOrgId: string) => `infisical-cloud-plan-last-known-${rootOrgId}`,
  // Set after a billing change to serve the cached plan while a background refresh converges.
  passThrough: (rootOrgId: string) => `license-cache-passthrough-${rootOrgId}`,
  revalidateLock: (rootOrgId: string) => `license-cache-revalidate-lock-${rootOrgId}`
};

const PlanKeyTtls = {
  planInSeconds: 900,
  lastKnownInSeconds: 86400,
  // Covers Stripe reconciling a billing change.
  passThroughInSeconds: 180,
  // A hosted checkout applies only once the customer finishes it, which can take minutes.
  passThroughCheckoutInSeconds: 900,
  revalidateLockInSeconds: 10
};

const jitteredPlanTtl = () => applyJitter(PlanKeyTtls.planInSeconds, 90);

export class PlanCache implements TPlanCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  async read(rootOrgId: string): Promise<{ plan: Plan | null; passThrough: boolean }> {
    const [plan, passThrough] = await this.keyStore.getItems([
      PlanKeys.plan(rootOrgId),
      PlanKeys.passThrough(rootOrgId)
    ]);
    return {
      plan: plan ? Plan.restore(JSON.parse(plan) as TPlanProps) : null,
      passThrough: Boolean(passThrough)
    };
  }

  async write(rootOrgId: string, plan: Plan) {
    const json = JSON.stringify(plan.toJSON());
    await this.keyStore.setItemWithExpiry(PlanKeys.plan(rootOrgId), jitteredPlanTtl(), json);
    await this.keyStore.setItemWithExpiry(
      PlanKeys.lastKnown(rootOrgId),
      PlanKeyTtls.lastKnownInSeconds,
      JSON.stringify({ plan: plan.toJSON(), fetchedAt: Date.now() })
    );
    await this.keyStore.deleteItem(PlanKeys.fallback(rootOrgId));
  }

  async writeFallback(rootOrgId: string, plan: Plan) {
    const ttl = jitteredPlanTtl();
    await this.keyStore.setItemWithExpiry(PlanKeys.plan(rootOrgId), ttl, JSON.stringify(plan.toJSON()));
    await this.keyStore.setItemWithExpiry(PlanKeys.fallback(rootOrgId), ttl, "1");
  }

  async isFallback(rootOrgId: string) {
    const [marker] = await this.keyStore.getItems([PlanKeys.fallback(rootOrgId)]);
    return Boolean(marker);
  }

  async lastKnown(rootOrgId: string): Promise<{ plan: Plan; fetchedAt: number } | null> {
    const [raw] = await this.keyStore.getItems([PlanKeys.lastKnown(rootOrgId)]);
    if (!raw) return null;
    const { plan, fetchedAt } = JSON.parse(raw) as { plan: TPlanProps; fetchedAt: number };
    return { plan: Plan.restore(plan), fetchedAt };
  }

  // After a billing change the License Server settles asynchronously (a Stripe webhook), so reads keep the
  // cached plan while a background refresh converges.
  async markForRevalidation(rootOrgId: string, checkout: boolean) {
    await this.keyStore.setItemWithExpiry(
      PlanKeys.passThrough(rootOrgId),
      checkout ? PlanKeyTtls.passThroughCheckoutInSeconds : PlanKeyTtls.passThroughInSeconds,
      "1"
    );
  }

  async invalidate(rootOrgId: string) {
    await this.keyStore.deleteItem(PlanKeys.plan(rootOrgId));
  }

  // Single-flight for a background revalidation: only the caller that sets the lock refreshes.
  async acquireRevalidateLock(rootOrgId: string) {
    const acquired = await this.keyStore.setItemWithExpiryNX(
      PlanKeys.revalidateLock(rootOrgId),
      PlanKeyTtls.revalidateLockInSeconds,
      "1"
    );
    return acquired === "OK";
  }
}
