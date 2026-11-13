import { EntityNotFoundError, ExternalSystemError } from "@app/domains/lib/errors";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { InstanceEntitlements } from "../../models/instance-entitlements";
import { Plan } from "../../models/plan";
import { SeatUsage } from "../../models/seat-usage";
import { TInstanceEntitlementsCache, TLicensePolicyService, TLicenseServer, TPlanCache } from "../dependencies";
import { TEntitlementOrg, TOrgDeletedResult } from "../helpers/license-server-types";
import { UsageQueue } from "../helpers/usage-queue";

export type TRefreshPlanOptions = {
  // After a billing change: keep serving the cached plan and refresh in the background, since the License
  // Server may not have applied the change yet.
  afterBillingChange?: { checkout?: boolean };
};

export type TLicenseService = {
  getInstanceEntitlements(): InstanceEntitlements;
  // Self-hosted with an online license: reads it from the License Server again. Throws when that fails, and the
  // current license stays. The module's background sync calls it.
  refreshInstanceEntitlements(): Promise<void>;
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
  // Root org's tree on cloud, whole instance on self-hosted or when orgId is null. To enforce a limit when adding
  // a member, read this before the transaction and check it with seatUsage.assertAvailable.
  getSeatUsage(orgId: string | null): Promise<SeatUsage>;
  // The org to count seats for (lockAndCountBillableOrgActors resolves its root), or null for the whole instance
  // (self-hosted). For a seat check that must be atomic with its insert, pass it to organizationsProjectsService.within(tx)
  // .lockAndCountBillableOrgActors inside the transaction and read the counts with SeatUsage.fromBillableActors.
  getSeatCountScope(orgId: string): string | null;
};

export class LicenseService implements TLicenseService {
  constructor(
    private readonly instanceEntitlementsCache: TInstanceEntitlementsCache,
    private readonly planCache: TPlanCache,
    private readonly usageQueue: UsageQueue,
    private readonly organizationsProjectsService: TOrganizationsProjectsService,
    private readonly licensePolicyService: TLicensePolicyService,
    private readonly licenseServer: TLicenseServer
  ) {}

  // Every read goes through here, so there is one place that answers what the instance is licensed for.
  getInstanceEntitlements(): InstanceEntitlements {
    return this.instanceEntitlementsCache.get();
  }

  hasOfflineLicenseKey(): boolean {
    return this.licensePolicyService.isOffline();
  }

  // Self-hosted orgs get the instance license. On cloud, if the License Server is down the org gets the
  // fallback plan until the cache expires.
  async getPlan(orgId: string): Promise<Plan> {
    const instance = this.getInstanceEntitlements();
    if (!instance.isCloud()) return instance.plan();

    // Unknown org: return the fallback without caching it.
    const rootOrgId = await this.organizationsProjectsService.findRootOrgId(orgId);
    if (!rootOrgId) return this.licensePolicyService.fallbackPlan();

    const cached = await this.planCache.read(rootOrgId);
    const plan = cached.plan ?? (await this.fetchPlanOrFallback(rootOrgId));
    if (cached.plan && cached.passThrough) this.revalidateInBackground(rootOrgId);
    if (plan.isPaid) this.usageQueue.reconcile(orgId);
    return plan;
  }

  async refreshPlan(orgId: string, opts: TRefreshPlanOptions = {}): Promise<void> {
    if (opts.afterBillingChange) {
      if (!this.getInstanceEntitlements().isCloud()) return;
      const rootOrgId = await this.organizationsProjectsService.resolveRootOrgId(orgId);
      try {
        await this.planCache.markForRevalidation(rootOrgId, Boolean(opts.afterBillingChange.checkout));
      } catch (error) {
        logger.error(error, `refreshPlan: failed to mark the plan for revalidation [orgId=${orgId}]`);
      }
      return;
    }
    if (this.getInstanceEntitlements().isCloud()) {
      const rootOrgId = await this.organizationsProjectsService.findRootOrgId(orgId);
      if (!rootOrgId) return;
      // Fetch before replacing the cache so a License Server failure keeps the current plan instead of caching
      // the fallback over it. The org is read outside the try so a DB error isn't blamed on the License Server.
      const rootOrg = await this.rootOrg(rootOrgId);
      let fetched: Plan;
      try {
        fetched = await this.licensePolicyService.fetchPlan(rootOrg);
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
    await this.refreshInstanceEntitlements();
  }

  async refreshInstanceEntitlements(): Promise<void> {
    const refreshed = await this.licensePolicyService.refreshInstanceEntitlements();
    if (refreshed) this.instanceEntitlementsCache.set(refreshed);
  }

  async invalidatePlan(orgId: string): Promise<void> {
    await this.planCache.invalidate(await this.organizationsProjectsService.resolveRootOrgId(orgId));
  }

  async isServingFallbackPlan(orgId: string): Promise<boolean> {
    if (!this.getInstanceEntitlements().isCloud()) return false;
    return this.planCache.isFallback(await this.organizationsProjectsService.resolveRootOrgId(orgId));
  }

  async getLastKnownPlan(orgId: string): Promise<{ plan: Plan; fetchedAt: number } | null> {
    return this.planCache.lastKnown(await this.organizationsProjectsService.resolveRootOrgId(orgId));
  }

  async closeDeletedOrg(orgId: string): Promise<TOrgDeletedResult> {
    const result = await this.licenseServer.deleteOrganization(orgId);
    await this.planCache.invalidate(orgId);
    return result;
  }

  async getSeatUsage(orgId: string | null): Promise<SeatUsage> {
    if (orgId === null || !this.getInstanceEntitlements().isCloud()) return this.countSeats(null);
    const rootOrgId = await this.organizationsProjectsService.findRootOrgId(orgId);
    if (!rootOrgId) throw new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return this.countSeats(rootOrgId);
  }

  getSeatCountScope(orgId: string): string | null {
    return this.getInstanceEntitlements().isCloud() ? orgId : null;
  }

  private async countSeats(orgId: string | null): Promise<SeatUsage> {
    return SeatUsage.fromBillableActors(await this.organizationsProjectsService.countBillableOrgActors(orgId));
  }

  // Only a License Server failure caches the fallback. DB or key store errors throw instead, so they can never
  // overwrite a cached paid plan.
  private async fetchPlanOrFallback(rootOrgId: string): Promise<Plan> {
    const rootOrg = await this.rootOrg(rootOrgId);
    let fetched: Plan;
    try {
      fetched = await this.licensePolicyService.fetchPlan(rootOrg);
    } catch (error) {
      logger.error(error, `getPlan: the License Server failed, serving the fallback plan [orgId=${rootOrgId}]`);
      const fallback = this.licensePolicyService.fallbackPlan();
      await this.planCache.writeFallback(rootOrgId, fallback);
      return fallback;
    }
    return this.cachePlan(rootOrgId, fetched);
  }

  private async rootOrg(rootOrgId: string): Promise<TEntitlementOrg> {
    const org = await this.organizationsProjectsService.findOrganization(rootOrgId);
    return org ? { id: rootOrgId, name: org.name, slug: org.slug } : { id: rootOrgId };
  }

  private async cachePlan(rootOrgId: string, fetched: Plan): Promise<Plan> {
    const plan = fetched.withWorkspacesUsed(await this.organizationsProjectsService.countWorkspaces(rootOrgId));
    await this.planCache.write(rootOrgId, plan);
    return plan;
  }

  // Pass-through mode (after a billing change): reads get the cached plan while one caller at a time refreshes it.
  private revalidateInBackground(rootOrgId: string) {
    void (async () => {
      if (!(await this.planCache.acquireRevalidateLock(rootOrgId))) return;
      await this.cachePlan(rootOrgId, await this.licensePolicyService.fetchPlan(await this.rootOrg(rootOrgId)));
    })().catch((error) => {
      logger.error(error, `getPlan: background revalidation failed [orgId=${rootOrgId}]`);
    });
  }
}
