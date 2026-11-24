import { randomUUID } from "node:crypto";

import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { applyJitter } from "@app/lib/dates";

import { Plan, TPlanFeatures } from "../models/plan";
import { TPlanCache } from "../services/dependencies";

// Key names and TTLs are frozen: old pods share the cache during a rolling deploy. Keyed by root org, since the
// License Server answers for the root.
const PlanKeys = {
  plan: (rootOrgId: string) => `infisical-cloud-plan-${rootOrgId}`,
  // Marks a cached plan as the fallback (License Server was down), not a real answer.
  fallback: (rootOrgId: string) => `infisical-cloud-plan-fallback-${rootOrgId}`,
  passThrough: (rootOrgId: string) => `license-cache-passthrough-${rootOrgId}`,
  revalidateLock: (rootOrgId: string) => `license-cache-revalidate-lock-${rootOrgId}`,
  // The soft TTL: past it the plan is still served, and refreshed in the background.
  fresh: (rootOrgId: string) => `infisical-cloud-plan-fresh-${rootOrgId}`
};

const PlanKeyTtls = {
  // The hard TTL: how long a plan outlives a License Server outage.
  planInSeconds: 86400,
  freshInSeconds: 900,
  // Covers Stripe reconciling a billing change.
  passThroughInSeconds: 180,
  // Hosted checkout only applies once the customer finishes it, which can take minutes.
  passThroughCheckoutInSeconds: 900,
  revalidateLockInSeconds: 10,
  refreshAheadInSeconds: 120
};

const jitteredFreshTtl = () => applyJitter(PlanKeyTtls.freshInSeconds, 90);

export class PlanCache implements TPlanCache {
  constructor(private readonly keyStore: TDomainKeyStore) {}

  async read(rootOrgId: string): Promise<{ plan: Plan | null; passThrough: boolean; stale: boolean }> {
    const [raw, passThrough, fallback, fresh] = await this.keyStore.getItems([
      PlanKeys.plan(rootOrgId),
      PlanKeys.passThrough(rootOrgId),
      PlanKeys.fallback(rootOrgId),
      PlanKeys.fresh(rootOrgId)
    ]);
    if (!raw) return { plan: null, passThrough: Boolean(passThrough), stale: false };
    const plan = Plan.restore(JSON.parse(raw) as TPlanFeatures);
    return { plan: fallback ? plan.asFallback() : plan, passThrough: Boolean(passThrough), stale: !fresh };
  }

  async write(rootOrgId: string, plan: Plan) {
    await this.keyStore.setItemWithExpiry(
      PlanKeys.plan(rootOrgId),
      PlanKeyTtls.planInSeconds,
      JSON.stringify(plan.toJSON())
    );
    await this.markFresh(rootOrgId);
    await this.keyStore.deleteItem(PlanKeys.fallback(rootOrgId));
  }

  // Lives only as long as the soft TTL, so a miss during an outage is retried soon rather than served for a day.
  async writeFallback(rootOrgId: string, plan: Plan) {
    const ttl = jitteredFreshTtl();
    await this.keyStore.setItemWithExpiry(PlanKeys.plan(rootOrgId), ttl, JSON.stringify(plan.toJSON()));
    await this.keyStore.setItemWithExpiry(PlanKeys.fallback(rootOrgId), ttl, "1");
    await this.markFresh(rootOrgId, ttl);
  }

  private async markFresh(rootOrgId: string, ttlInSeconds = jitteredFreshTtl()) {
    await this.keyStore.setItemWithExpiry(
      PlanKeys.fresh(rootOrgId),
      Math.max(ttlInSeconds - PlanKeyTtls.refreshAheadInSeconds, 1),
      "1"
    );
  }

  // The License Server settles billing changes async (Stripe webhook), so reads keep serving the cached plan
  // while a background refresh catches up.
  async markForRevalidation(rootOrgId: string, checkout: boolean) {
    await this.keyStore.setItemWithExpiry(
      PlanKeys.passThrough(rootOrgId),
      checkout ? PlanKeyTtls.passThroughCheckoutInSeconds : PlanKeyTtls.passThroughInSeconds,
      "1"
    );
  }

  // Marks the plan stale without removing it: the next read serves it and refreshes it in the background.
  async invalidate(rootOrgId: string) {
    await this.keyStore.deleteItem(PlanKeys.fresh(rootOrgId));
  }

  async delete(rootOrgId: string) {
    await this.keyStore.deleteItem(PlanKeys.plan(rootOrgId));
    await this.keyStore.deleteItem(PlanKeys.fresh(rootOrgId));
    await this.keyStore.deleteItem(PlanKeys.fallback(rootOrgId));
  }

  // Single-flight for a background refresh: only the caller that sets the lock refreshes. Expires on its own.
  async acquireRevalidateLock(rootOrgId: string): Promise<string | null> {
    const token = randomUUID();
    const acquired = await this.keyStore.setItemWithExpiryNX(
      PlanKeys.revalidateLock(rootOrgId),
      PlanKeyTtls.revalidateLockInSeconds,
      token
    );
    return acquired === "OK" ? token : null;
  }
}
