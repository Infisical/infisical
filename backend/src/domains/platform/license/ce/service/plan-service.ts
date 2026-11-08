import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { PlanCache } from "../data-access/plan-cache";
import { UsageReportMemory } from "../data-access/usage-report-memory";
import { InstanceType, TInstanceEntitlementsProps, TInstanceFeatures } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { Plan, TPlanFeature, TPlanProps } from "../model/plan";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { TLicenseHooks } from "./license-hooks";
import { OrganizationDirectory } from "./organization-directory";
import { UsageQueue } from "./usage-queue";

export type TRefreshPlanOptions = {
  // Set after a billing change: the plan keeps serving and refreshes in the background, instead of being
  // fetched now, before the License Server has applied the change.
  afterBillingChange?: { checkout?: boolean };
};

export type TPlanServiceDeps = {
  instance: InstanceEntitlementsHolder;
  planCache: PlanCache;
  usageReportMemory: UsageReportMemory;
  organizations: OrganizationDirectory;
  hooks: TLicenseHooks;
  usageQueue: UsageQueue;
};

// What the instance and each org are licensed for: reading and caching plans, refreshing them, and the
// subscription changes that move a plan (seat sync, cancellation).
export class PlanService {
  constructor(private readonly deps: TPlanServiceDeps) {}

  getInstanceEntitlements(): TInstanceEntitlementsProps {
    return this.deps.instance.get().toJSON();
  }

  getInstanceType(): InstanceType {
    return this.deps.instance.get().instanceType;
  }

  hasInstanceFeature(feature: keyof TInstanceFeatures): boolean {
    return this.deps.instance.get().has(feature);
  }

  getLicenseId(): string {
    return this.deps.instance.get().licenseId;
  }

  async getPlan(orgId: string): Promise<TPlanProps> {
    return (await this.resolve(orgId)).toJSON();
  }

  async hasFeature(orgId: string, feature: TPlanFeature): Promise<boolean> {
    return (await this.resolve(orgId)).has(feature);
  }

  async assertFeature(orgId: string, feature: TPlanFeature): Promise<void> {
    (await this.resolve(orgId)).assert(feature);
  }

  async invalidatePlan(orgId: string): Promise<void> {
    await this.deps.planCache.invalidate(await this.deps.organizations.rootOrgIdOf(orgId));
  }

  async isServingFallbackPlan(orgId: string): Promise<boolean> {
    if (!this.deps.instance.isCloud()) return false;
    return this.deps.planCache.isFallback(await this.deps.organizations.rootOrgIdOf(orgId));
  }

  async getLastKnownPlan(orgId: string): Promise<{ plan: TPlanProps; fetchedAt: number } | null> {
    const lastKnown = await this.deps.planCache.lastKnown(await this.deps.organizations.rootOrgIdOf(orgId));
    return lastKnown ? { plan: lastKnown.plan.toJSON(), fetchedAt: lastKnown.fetchedAt } : null;
  }

  // An org's plan. Self-hosted orgs get the instance's license. On cloud the root org's plan is cached; when
  // the License Server cannot be reached the org gets the fallback plan until the cache expires.
  async resolve(orgId: string): Promise<Plan> {
    const instance = this.deps.instance.get();
    if (!instance.isCloud()) return instance.plan();

    let cacheKey = orgId;
    try {
      const root = await this.deps.organizations.findRootOrg(orgId);
      if (!root) throw new Error(`Organization with ID '${orgId}' not found`);
      cacheKey = root.id;

      const [cached, isReconciled] = await Promise.all([
        this.deps.planCache.read(root.id),
        this.deps.usageReportMemory.isReconciled(orgId)
      ]);
      const plan = cached.plan ?? (await this.fetchAndCache(root.id));
      if (cached.plan && cached.passThrough) this.revalidateInBackground(root.id);
      if (!isReconciled && plan.isPaid) this.deps.usageQueue.reconcile(orgId);
      return plan;
    } catch (error) {
      logger.error(error, `getPlan: serving the fallback plan [orgId=${orgId}]`);
      const fallback = this.deps.hooks.fallbackPlan();
      await this.deps.planCache.writeFallback(cacheKey, fallback);
      return fallback;
    }
  }

  // Fetches the plan again now; after a billing change, refreshes it in the background instead.
  async refreshPlan(orgId: string, opts: TRefreshPlanOptions = {}): Promise<void> {
    if (opts.afterBillingChange) {
      if (!this.deps.instance.isCloud()) return;
      const rootOrgId = await this.deps.organizations.rootOrgIdOf(orgId);
      try {
        await this.deps.planCache.markForRevalidation(rootOrgId, Boolean(opts.afterBillingChange.checkout));
      } catch (error) {
        logger.error(error, `refreshPlan: failed to mark the plan for revalidation [orgId=${orgId}]`);
      }
      return;
    }
    if (this.deps.instance.isCloud()) {
      await this.deps.planCache.invalidate(await this.deps.organizations.rootOrgIdOf(orgId));
      await this.resolve(orgId);
      return;
    }
    const refreshed = await this.deps.hooks.refreshInstanceEntitlements();
    if (refreshed) this.deps.instance.set(refreshed);
  }

  // Call after the change to the org's members commits. Reports the new seat count and refreshes the plan,
  // which carries it. A failure is logged rather than thrown, since the change it follows has committed.
  async syncSeats(orgId: string): Promise<void> {
    try {
      const rootOrgId = await this.deps.organizations.rootOrgIdOf(orgId);
      this.deps.usageQueue.emit(rootOrgId, Meter.UserIdentities.key);
      await this.refreshPlan(rootOrgId);
    } catch (error) {
      logger.error(error, `syncSeats: failed to sync seats [orgId=${orgId}]`);
    }
  }

  // Cloud only. An org with no subscription answers 4xx (a BadRequestError), which counts as cancelled; any
  // other failure is thrown so the caller can stop before deleting the org.
  async cancelSubscription(orgId: string): Promise<void> {
    if (!this.deps.instance.isCloud()) return;

    try {
      await this.deps.hooks.cancelSubscription(orgId);
    } catch (error) {
      if (!(error instanceof BadRequestError)) throw error;
      logger.info(`cancelOrgSubscription: no subscription to cancel [orgId=${orgId}]`);
    }
    await this.deps.planCache.invalidate(orgId);
  }

  private async fetchAndCache(rootOrgId: string): Promise<Plan> {
    const root = await this.deps.organizations.findRootOrg(rootOrgId);
    if (!root) throw new Error(`Organization with ID '${rootOrgId}' not found`);
    const plan = (await this.deps.hooks.fetchPlan(root)).withWorkspacesUsed(
      await this.deps.organizations.countWorkspacesUsed(root.id)
    );
    await this.deps.planCache.write(root.id, plan);
    return plan;
  }

  // While the pass-through marker is set (after a billing change), each read serves the cached plan and one
  // caller at a time fetches a fresh one behind it.
  private revalidateInBackground(rootOrgId: string) {
    void (async () => {
      if (!(await this.deps.planCache.acquireRevalidateLock(rootOrgId))) return;
      await this.fetchAndCache(rootOrgId);
    })().catch((error) => {
      logger.error(error, `getPlan: background revalidation failed [orgId=${rootOrgId}]`);
    });
  }
}
