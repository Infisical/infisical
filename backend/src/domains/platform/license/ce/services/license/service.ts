import { EntityNotFoundError, ExternalSystemError } from "@app/domains/lib/errors";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { InstanceEntitlements, InstanceType } from "../../models/instance-entitlements";
import { Plan } from "../../models/plan";
import { SeatUsage } from "../../models/seat-usage";
import { TLicenseProvider, TLicenseServer, TPlanCache, TUsageReportCache } from "../dependencies";
import { TEntitlementOrg, TOrgDeletedResult } from "../helpers/license-server-types";
import { UsageQueue } from "../helpers/usage-queue";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";

export type TRefreshPlanOptions = {
  // After a billing change: keep serving the cached plan and refresh in the background, since the License
  // Server may not have applied the change yet.
  afterBillingChange?: { checkout?: boolean };
};

export type TLicenseService = {
  getInstanceEntitlements(): InstanceEntitlements;
  getInstanceType(): InstanceType;
  getLicenseId(): string;
  // Whether LICENSE_KEY or LICENSE_KEY_OFFLINE holds an offline key, whether or not it verifies.
  hasOfflineLicenseKey(): boolean;
  getPlan(orgId: string): Promise<Plan>;
  refreshPlan(orgId: string, opts?: TRefreshPlanOptions): Promise<void>;
  // Drops the cache without refetching now.
  invalidatePlan(orgId: string): Promise<void>;
  isServingFallbackPlan(orgId: string): Promise<boolean>;
  getLastKnownPlan(orgId: string): Promise<{ plan: Plan; fetchedAt: number } | null>;
  // Cloud only. Safe to repeat; throws so the caller can retry.
  closeDeletedOrg(orgId: string): Promise<TOrgDeletedResult>;
  // Root org's tree on cloud, whole instance on self-hosted. To enforce a limit when adding a member, read
  // this before the transaction and check it with seatUsage.assertAvailable.
  getSeatUsage(orgId: string): Promise<SeatUsage>;
  getInstanceSeatUsage(): Promise<SeatUsage>;
  // The org to count seats for (lockAndCountBillableOrgActors resolves its root), or null for the whole instance
  // (self-hosted). For a seat check that must be atomic with its insert, pass it to organizationsProjectsService.within(tx)
  // .lockAndCountBillableOrgActors inside the transaction and read the counts with SeatUsage.fromBillableActors.
  getSeatCountScope(orgId: string): string | null;
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

  getInstanceEntitlements(): InstanceEntitlements {
    return this.deps.instance.get();
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

  // Self-hosted orgs get the instance license. On cloud, if the License Server is down the org gets the
  // fallback plan until the cache expires.
  async getPlan(orgId: string): Promise<Plan> {
    const instance = this.deps.instance.get();
    if (!instance.isCloud()) return instance.plan();

    // Unknown org: return the fallback without caching it.
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
      // Fetch before replacing the cache so a License Server failure keeps the current plan instead of caching
      // the fallback over it. The org is read outside the try so a DB error isn't blamed on the License Server.
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

  getInstanceSeatUsage(): Promise<SeatUsage> {
    return this.countSeats(null);
  }

  getSeatCountScope(orgId: string): string | null {
    return this.deps.instance.isCloud() ? orgId : null;
  }

  private async countSeats(orgId: string | null): Promise<SeatUsage> {
    return SeatUsage.fromBillableActors(await this.deps.organizationsProjectsService.countBillableOrgActors(orgId));
  }

  // Only a License Server failure caches the fallback. DB or key store errors throw instead, so they can never
  // overwrite a cached paid plan.
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

  private async rootOrg(rootOrgId: string): Promise<TEntitlementOrg> {
    const org = await this.deps.organizationsProjectsService.findOrganization(rootOrgId);
    return org ? { id: rootOrgId, name: org.name, slug: org.slug } : { id: rootOrgId };
  }

  private async cachePlan(rootOrgId: string, fetched: Plan): Promise<Plan> {
    const plan = fetched.withWorkspacesUsed(await this.deps.organizationsProjectsService.countWorkspaces(rootOrgId));
    await this.deps.planCache.write(rootOrgId, plan);
    return plan;
  }

  // Pass-through mode (after a billing change): reads get the cached plan while one caller at a time refreshes it.
  private revalidateInBackground(rootOrgId: string) {
    void (async () => {
      if (!(await this.deps.planCache.acquireRevalidateLock(rootOrgId))) return;
      await this.cachePlan(rootOrgId, await this.deps.provider.fetchPlan(await this.rootOrg(rootOrgId)));
    })().catch((error) => {
      logger.error(error, `getPlan: background revalidation failed [orgId=${rootOrgId}]`);
    });
  }
}
