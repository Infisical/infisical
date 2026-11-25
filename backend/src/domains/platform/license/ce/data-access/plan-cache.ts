import { randomUUID } from "node:crypto";

import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { applyJitter } from "@app/lib/dates";

import { Plan, TPlanFeatures } from "../models/plan";
import { TPlanCache } from "../services/dependencies";

// Key names are frozen: old pods share the cache during a rolling deploy. Keyed by root org, since the License
// Server answers for the root.
const PlanKeys = {
  plan: (rootOrgId: string) => `infisical-cloud-plan-${rootOrgId}`,
  passThrough: (rootOrgId: string) => `license-cache-passthrough-${rootOrgId}`,
  revalidateLock: (rootOrgId: string) => `license-cache-revalidate-lock-${rootOrgId}`
};

const PlanKeyTtls = {
  planInSeconds: 1800,
  // The background refresh starts this long before the plan expires, jittered so orgs don't refresh together.
  refreshAheadInSeconds: 600,
  // Covers Stripe reconciling a billing change.
  passThroughInSeconds: 180,
  // Hosted checkout only applies once the customer finishes it, which can take minutes.
  passThroughCheckoutInSeconds: 900,
  revalidateLockInSeconds: 10
};

// A top-level field beside the features, not a wrapper, so old pods still read the value as a plan. A value without
// it (written by an old pod) is stale.
type TCachedPlan = TPlanFeatures & { refreshAt?: number };

export class PlanCache implements TPlanCache {
  constructor(
    private readonly keyStore: TDomainKeyStore,
    private readonly now: () => number = Date.now
  ) {}

  async read(rootOrgId: string): Promise<{ plan: Plan | null; passThrough: boolean; stale: boolean }> {
    const [raw, passThrough] = await this.keyStore.getItems([
      PlanKeys.plan(rootOrgId),
      PlanKeys.passThrough(rootOrgId)
    ]);
    if (!raw) return { plan: null, passThrough: Boolean(passThrough), stale: false };
    const { refreshAt, ...features } = JSON.parse(raw) as TCachedPlan;
    return {
      plan: Plan.restore(features),
      passThrough: Boolean(passThrough),
      stale: !(refreshAt && refreshAt > this.now())
    };
  }

  async write(rootOrgId: string, plan: Plan) {
    const refreshInSeconds = PlanKeyTtls.planInSeconds - applyJitter(PlanKeyTtls.refreshAheadInSeconds, 60);
    await this.writeValue(rootOrgId, { ...plan.toJSON(), refreshAt: this.now() + refreshInSeconds * 1000 });
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

  async delete(rootOrgId: string) {
    await this.keyStore.deleteItem(PlanKeys.plan(rootOrgId));
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

  private async writeValue(rootOrgId: string, value: TCachedPlan) {
    await this.keyStore.setItemWithExpiry(PlanKeys.plan(rootOrgId), PlanKeyTtls.planInSeconds, JSON.stringify(value));
  }
}
