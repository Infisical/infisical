import { logger } from "@app/lib/logger";

import { TPlan } from "../model/plan";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { TLicenseHooks } from "./license-hooks";
import { OrganizationDirectory } from "./organization-directory";
import { PlanCache } from "./plan-cache";
import { UsageQueue } from "./usage-queue";

export type TRefreshPlanOptions = {
  // Set after a billing change: the plan keeps serving and refreshes in the background, instead of being
  // fetched now, before the License Server has applied the change.
  afterBillingChange?: { checkout?: boolean };
};

export type TPlanResolverDeps = {
  instance: InstanceEntitlementsHolder;
  planCache: PlanCache;
  organizations: OrganizationDirectory;
  hooks: TLicenseHooks;
  usageQueue: UsageQueue;
};

// Reads and refreshes plans. Shared by the services that need an org's plan, so the cache rules live in one
// place.
export class PlanResolver {
  constructor(private readonly deps: TPlanResolverDeps) {}

  // An org's plan. Self-hosted orgs get the instance's license. On cloud the root org's plan is cached; when
  // the License Server cannot be reached the org gets the community defaults until the cache expires.
  async resolve(orgId: string): Promise<TPlan> {
    const instance = this.deps.instance.get();
    if (!this.deps.instance.isCloud()) return instance.features;

    let cacheKey = orgId;
    try {
      const root = await this.deps.organizations.findRootOrg(orgId);
      if (!root) throw new Error(`Organization with ID '${orgId}' not found`);
      cacheKey = root.id;

      const cached = await this.deps.planCache.read(root.id, orgId);
      const plan = cached.plan ?? (await this.fetchAndCache(root.id));
      if (cached.plan && cached.passThrough) this.revalidateInBackground(root.id);
      if (!cached.isReconciled && plan.slug) this.deps.usageQueue.reconcile(orgId);
      return plan;
    } catch (error) {
      logger.error(error, `getPlan: serving the fallback plan [orgId=${orgId}]`);
      const fallback = this.deps.hooks.fallbackPlan(instance.features);
      await this.deps.planCache.writeFallback(cacheKey, fallback);
      return fallback;
    }
  }

  async refresh(orgId: string, opts: TRefreshPlanOptions = {}): Promise<void> {
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

  private async fetchAndCache(rootOrgId: string): Promise<TPlan> {
    const root = await this.deps.organizations.findRootOrg(rootOrgId);
    if (!root) throw new Error(`Organization with ID '${rootOrgId}' not found`);
    const plan = await this.deps.hooks.fetchPlan(root);
    const withUsage = { ...plan, workspacesUsed: await this.deps.organizations.countWorkspacesUsed(root.id) };
    await this.deps.planCache.write(root.id, withUsage);
    return withUsage;
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
