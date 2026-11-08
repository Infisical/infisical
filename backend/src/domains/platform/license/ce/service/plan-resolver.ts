import { logger } from "@app/lib/logger";

import { PlanCache } from "../data-access/plan-cache";
import { UsageReportMemory } from "../data-access/usage-report-memory";
import { TLicenseServerClient } from "../license-server-client/license-server-client";
import { Plan } from "../model/plan";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { TLicenseHooks } from "./license-hooks";
import { OrganizationDirectory } from "./organization-directory";
import { UsageQueue } from "./usage-queue";

export type TRefreshPlanOptions = {
  // Set after a billing change: the plan keeps serving and refreshes in the background, instead of being
  // fetched now, before the License Server has applied the change.
  afterBillingChange?: { checkout?: boolean };
};

export type TPlanResolverDeps = {
  instance: InstanceEntitlementsHolder;
  planCache: PlanCache;
  usageReportMemory: UsageReportMemory;
  organizations: OrganizationDirectory;
  licenseServerClient: TLicenseServerClient;
  hooks: TLicenseHooks;
  usageQueue: UsageQueue;
};

// Reads and refreshes plans. Shared by the services that need an org's plan, so the cache rules live in one
// place.
export class PlanResolver {
  constructor(private readonly deps: TPlanResolverDeps) {}

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
      const fallback = this.deps.hooks.fallbackPlan(instance);
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

  private async fetchAndCache(rootOrgId: string): Promise<Plan> {
    const root = await this.deps.organizations.findRootOrg(rootOrgId);
    if (!root) throw new Error(`Organization with ID '${rootOrgId}' not found`);
    const entitlements = await this.deps.licenseServerClient.getEntitlements(root);
    if (!entitlements) throw new Error(`License Server entitlements are unavailable [orgId=${root.id}]`);
    const plan = this.deps.hooks
      .planFromEntitlements(entitlements)
      .withWorkspacesUsed(await this.deps.organizations.countWorkspacesUsed(root.id));
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
