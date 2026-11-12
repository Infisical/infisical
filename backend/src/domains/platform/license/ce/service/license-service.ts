import { EntityNotFoundError, ExternalSystemError } from "@app/domains/lib/errors";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { InstanceType, TInstanceEntitlementsProps } from "../model/instance-entitlements";
import { Plan } from "../model/plan";
import { SeatUsage } from "../model/seat-usage";
import { TLicenseProvider, TLicenseServer, TPlanCache, TUsageReportCache } from "./dependencies";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { TEntitlementOrg, TOrgDeletedResult } from "./license-server-types/license-server-types";
import { UsageQueue } from "./usage-queue";

export type TRefreshPlanOptions = {
  // Set after a billing change: the plan keeps serving and refreshes in the background, instead of being
  // fetched now, before the License Server has applied the change.
  afterBillingChange?: { checkout?: boolean };
};

export type TLicenseService = {
  getInstanceEntitlements(): TInstanceEntitlementsProps;
  getInstanceType(): InstanceType;
  // The offline license's id, or "unknown".
  getLicenseId(): string;
  // Whether LICENSE_KEY holds an offline key, whether or not it verifies.
  hasOfflineLicenseKey(): boolean;
  getPlan(orgId: string): Promise<Plan>;
  // Fetches the plan again now; after a billing change, pass afterBillingChange to refresh in the background.
  refreshPlan(orgId: string, opts?: TRefreshPlanOptions): Promise<void>;
  // Drops the cached plan so the next read fetches it, without fetching now.
  invalidatePlan(orgId: string): Promise<void>;
  isServingFallbackPlan(orgId: string): Promise<boolean>;
  getLastKnownPlan(orgId: string): Promise<{ plan: Plan; fetchedAt: number } | null>;
  // Cloud: after a root org is deleted, cancels its subscription and closes its licenses. Safe to repeat;
  // any failure is thrown so the caller can retry.
  closeDeletedOrg(orgId: string): Promise<TOrgDeletedResult>;
  // Seats in use for the org's plan: the root org's tree on cloud, the whole instance self-hosted. To enforce
  // a limit while adding a member, read this before the transaction and check it with seatUsage.assertAvailable.
  getSeatUsage(orgId: string): Promise<SeatUsage>;
  getInstanceSeatUsage(): Promise<SeatUsage>;
};

export type TLicenseServiceDeps = {
  instance: InstanceEntitlementsHolder;
  planCache: TPlanCache;
  usageReportCache: TUsageReportCache;
  usageQueue: UsageQueue;
  organizationsProjectsService: TOrganizationsProjectsService;
  provider: TLicenseProvider;
  licenseServer: TLicenseServer;
};

export class LicenseService implements TLicenseService {
  constructor(private readonly deps: TLicenseServiceDeps) {}

  getInstanceEntitlements(): TInstanceEntitlementsProps {
    return this.deps.instance.get().toJSON();
  }

  getInstanceType(): InstanceType {
    return this.deps.instance.get().instanceType;
  }

  getLicenseId(): string {
    return this.deps.instance.get().licenseId;
  }

  hasOfflineLicenseKey(): boolean {
    return this.deps.provider.isOffline();
  }

  // Self-hosted orgs get the instance's license. On cloud the root org's plan is cached; when the License
  // Server cannot be reached the org gets the fallback plan until the cache expires.
  async getPlan(orgId: string): Promise<Plan> {
    const instance = this.deps.instance.get();
    if (!instance.isCloud()) return instance.plan();

    // An org that does not exist has no plan to fetch: it gets the fallback, which is not cached.
    const rootOrgId = await this.deps.organizationsProjectsService.findRootOrgId(orgId);
    if (!rootOrgId) return this.deps.provider.fallbackPlan();

    const [cached, isReconciled] = await Promise.all([
      this.deps.planCache.read(rootOrgId),
      this.deps.usageReportCache.isReconciled(orgId)
    ]);
    const plan = cached.plan ?? (await this.fetchPlanOrFallback(rootOrgId));
    if (cached.plan && cached.passThrough) this.revalidateInBackground(rootOrgId);
    if (!isReconciled && plan.isPaid) this.deps.usageQueue.reconcile(orgId);
    return plan;
  }

  async refreshPlan(orgId: string, opts: TRefreshPlanOptions = {}): Promise<void> {
    if (opts.afterBillingChange) {
      if (!this.deps.instance.isCloud()) return;
      const rootOrgId = await this.deps.organizationsProjectsService.resolveRootOrgId(orgId);
      try {
        await this.deps.planCache.markForRevalidation(rootOrgId, Boolean(opts.afterBillingChange.checkout));
      } catch (error) {
        logger.error(error, `refreshPlan: failed to mark the plan for revalidation [orgId=${orgId}]`);
      }
      return;
    }
    if (this.deps.instance.isCloud()) {
      const rootOrgId = await this.deps.organizationsProjectsService.findRootOrgId(orgId);
      if (!rootOrgId) return;
      // Fetched before the cached plan is replaced: a License Server failure keeps the plan the org has,
      // rather than caching the fallback over it. The org is read outside the try, so a database error is not
      // reported as the License Server being unreachable.
      const rootOrg = await this.rootOrg(rootOrgId);
      let fetched: Plan;
      try {
        fetched = await this.deps.provider.fetchPlan(rootOrg);
      } catch (error) {
        throw new ExternalSystemError({
          name: "RefreshPlan",
          cause: error,
          message:
            "Failed to refresh the plan because the license server could not be reached. Your current plan stays in place; try again in a few minutes."
        });
      }
      await this.cachePlan(rootOrgId, fetched);
      return;
    }
    const refreshed = await this.deps.provider.refreshInstanceEntitlements();
    if (refreshed) this.deps.instance.set(refreshed);
  }

  async invalidatePlan(orgId: string): Promise<void> {
    await this.deps.planCache.invalidate(await this.deps.organizationsProjectsService.resolveRootOrgId(orgId));
  }

  async isServingFallbackPlan(orgId: string): Promise<boolean> {
    if (!this.deps.instance.isCloud()) return false;
    return this.deps.planCache.isFallback(await this.deps.organizationsProjectsService.resolveRootOrgId(orgId));
  }

  async getLastKnownPlan(orgId: string): Promise<{ plan: Plan; fetchedAt: number } | null> {
    return this.deps.planCache.lastKnown(await this.deps.organizationsProjectsService.resolveRootOrgId(orgId));
  }

  async closeDeletedOrg(orgId: string): Promise<TOrgDeletedResult> {
    const result = await this.deps.licenseServer.deleteOrganization(orgId);
    await this.deps.planCache.invalidate(orgId);
    return result;
  }

  async getSeatUsage(orgId: string): Promise<SeatUsage> {
    if (!this.deps.instance.isCloud()) return this.countSeats(null);
    const rootOrgId = await this.deps.organizationsProjectsService.findRootOrgId(orgId);
    if (!rootOrgId) throw new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return this.countSeats(rootOrgId);
  }

  // Every org on the instance, which is what an instance-wide identity limit caps.
  getInstanceSeatUsage(): Promise<SeatUsage> {
    return this.countSeats(null);
  }

  private async countSeats(orgId: string | null): Promise<SeatUsage> {
    const { users, identities } = await this.deps.organizationsProjectsService.countBillableOrgActors(orgId);
    return SeatUsage.create({ membersUsed: users, identitiesUsed: users + identities });
  }

  // Only a License Server failure serves and caches the fallback: that is what the fallback marker records. A
  // database or key store error is thrown instead, so it can never overwrite a cached paid plan.
  private async fetchPlanOrFallback(rootOrgId: string): Promise<Plan> {
    const rootOrg = await this.rootOrg(rootOrgId);
    let fetched: Plan;
    try {
      fetched = await this.deps.provider.fetchPlan(rootOrg);
    } catch (error) {
      logger.error(error, `getPlan: the License Server failed, serving the fallback plan [orgId=${rootOrgId}]`);
      const fallback = this.deps.provider.fallbackPlan();
      await this.deps.planCache.writeFallback(rootOrgId, fallback);
      return fallback;
    }
    return this.cachePlan(rootOrgId, fetched);
  }

  // The License Server records the name and slug in its org directory.
  private async rootOrg(rootOrgId: string): Promise<TEntitlementOrg> {
    const org = await this.deps.organizationsProjectsService.findOrganization(rootOrgId);
    return org ? { id: rootOrgId, name: org.name, slug: org.slug } : { id: rootOrgId };
  }

  private async cachePlan(rootOrgId: string, fetched: Plan): Promise<Plan> {
    const plan = fetched.withWorkspacesUsed(await this.deps.organizationsProjectsService.countWorkspaces(rootOrgId));
    await this.deps.planCache.write(rootOrgId, plan);
    return plan;
  }

  // While the pass-through marker is set (after a billing change), each read serves the cached plan and one
  // caller at a time fetches a fresh one behind it.
  private revalidateInBackground(rootOrgId: string) {
    void (async () => {
      if (!(await this.deps.planCache.acquireRevalidateLock(rootOrgId))) return;
      await this.cachePlan(rootOrgId, await this.deps.provider.fetchPlan(await this.rootOrg(rootOrgId)));
    })().catch((error) => {
      logger.error(error, `getPlan: background revalidation failed [orgId=${rootOrgId}]`);
    });
  }
}
