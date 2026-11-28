import { EntityNotFoundError, ExternalSystemError } from "@app/domains/lib/errors";
import { TOrganizationsService } from "@app/domains/platform/organizations/ce/module";
import { logger } from "@app/lib/logger";

import { InstanceEntitlements } from "../../models/instance-entitlements";
import { Plan } from "../../models/plan";
import { SeatUsage } from "../../models/seat-usage";
import { TInstanceEntitlementsCache, TLicensePolicyService, TLicenseServer, TPlanCache } from "../dependencies";
import { TEntitlementOrg, TOrgDeletedResult } from "../helpers/license-server-types";
import { UsageQueue } from "../helpers/usage-queue";

export type TRefreshPlanOptions = {
  // Keep serving the cached plan and refresh in the background: the License Server may not have applied the change yet.
  afterBillingChange?: { checkout?: boolean };
};

export type TLicenseService = {
  getInstanceEntitlements(): InstanceEntitlements;
  // Self-hosted online license only. Throws on failure and the current license stays.
  refreshInstanceEntitlements(): Promise<void>;
  // Whether LICENSE_KEY or LICENSE_KEY_OFFLINE holds an offline key, whether or not it verifies.
  hasOfflineLicenseKey(): boolean;
  getPlan(orgId: string): Promise<Plan>;
  refreshPlan(orgId: string, opts?: TRefreshPlanOptions): Promise<void>;
  // Cloud only. Safe to repeat; throws so the caller can retry.
  closeDeletedOrg(orgId: string): Promise<TOrgDeletedResult>;
  // Root org's tree on cloud, whole instance on self-hosted or for null. To enforce a limit when adding a member,
  // read it before the transaction and check it with seatUsage.assertAvailable inside.
  getSeatUsage(orgId: string | null): Promise<SeatUsage>;
  // The org to count seats for, or null for the whole instance (self-hosted). For a check atomic with its insert,
  // pass it to organizationsService.within(tx).lockAndCountBillableOrgActors inside the transaction.
  getSeatCountScope(orgId: string): string | null;
};

export class LicenseService implements TLicenseService {
  constructor(
    private readonly instanceEntitlementsCache: TInstanceEntitlementsCache,
    private readonly planCache: TPlanCache,
    private readonly usageQueue: UsageQueue,
    private readonly organizationsService: TOrganizationsService,
    private readonly licensePolicyService: TLicensePolicyService,
    private readonly licenseServer: TLicenseServer
  ) {}

  // Read the instance license only through here: the e2e suite's overrideLicenseFeatures spies on this method.
  getInstanceEntitlements(): InstanceEntitlements {
    return this.instanceEntitlementsCache.get();
  }

  hasOfflineLicenseKey(): boolean {
    return this.licensePolicyService.isOffline();
  }

  // Self-hosted orgs get the instance license. On cloud, a cached plan is served until it expires, refreshed in the
  // background once stale. Only with nothing cached and no way to fetch (unknown org, License Server, database or key
  // store failure) is the free plan served, uncached.
  async getPlan(orgId: string): Promise<Plan> {
    const instance = this.getInstanceEntitlements();
    if (!instance.isCloud()) return instance.plan();
    try {
      return await this.getCloudPlan(orgId);
    } catch (error) {
      logger.error(error, `getPlan: failed to read the plan, serving the free plan uncached [orgId=${orgId}]`);
      return this.licensePolicyService.freePlan();
    }
  }

  private async getCloudPlan(orgId: string): Promise<Plan> {
    let rootOrgId: string | null = orgId;
    let cached = await this.planCache.read(orgId);
    if (!cached.plan) {
      rootOrgId = await this.organizationsService.findRootOrgId(orgId);
      if (!rootOrgId) return this.licensePolicyService.freePlan();
      if (rootOrgId !== orgId) cached = await this.planCache.read(rootOrgId);
    }

    const plan = cached.plan ?? (await this.fetchPlanOrFree(rootOrgId));
    if (cached.plan && (cached.passThrough || cached.stale)) this.revalidateInBackground(rootOrgId);
    if (plan.isPaid) this.usageQueue.reconcile(orgId);
    return plan;
  }

  // On cloud, fetch before replacing the cache so a License Server failure keeps the current plan. The org is read
  // outside the try so a DB error isn't blamed on the License Server.
  async refreshPlan(orgId: string, opts: TRefreshPlanOptions = {}): Promise<void> {
    if (opts.afterBillingChange) {
      if (!this.getInstanceEntitlements().isCloud()) return;
      try {
        const rootOrgId = await this.organizationsService.resolveRootOrgId(orgId);
        await this.planCache.markForRevalidation(rootOrgId, Boolean(opts.afterBillingChange.checkout));
      } catch (error) {
        logger.error(error, `refreshPlan: failed to mark the plan for revalidation [orgId=${orgId}]`);
      }
      return;
    }
    if (this.getInstanceEntitlements().isCloud()) {
      const rootOrgId = await this.organizationsService.findRootOrgId(orgId);
      if (!rootOrgId) return;
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

  async closeDeletedOrg(orgId: string): Promise<TOrgDeletedResult> {
    const result = await this.licenseServer.deleteOrganization(orgId);
    await this.planCache.delete(orgId);
    return result;
  }

  async getSeatUsage(orgId: string | null): Promise<SeatUsage> {
    if (orgId === null || !this.getInstanceEntitlements().isCloud()) return this.countSeats(null);
    const rootOrgId = await this.organizationsService.findRootOrgId(orgId);
    if (!rootOrgId) throw new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return this.countSeats(rootOrgId);
  }

  getSeatCountScope(orgId: string): string | null {
    return this.getInstanceEntitlements().isCloud() ? orgId : null;
  }

  private async countSeats(orgId: string | null): Promise<SeatUsage> {
    return SeatUsage.fromBillableActors(await this.organizationsService.countBillableOrgActors(orgId));
  }

  // Nothing is cached on a License Server failure, so the next read fetches again.
  private async fetchPlanOrFree(rootOrgId: string): Promise<Plan> {
    const rootOrg = await this.rootOrg(rootOrgId);
    let fetched: Plan;
    try {
      fetched = await this.licensePolicyService.fetchPlan(rootOrg);
    } catch (error) {
      logger.error(error, `getPlan: the License Server failed, serving the free plan uncached [orgId=${rootOrgId}]`);
      return this.licensePolicyService.freePlan();
    }
    return this.cachePlan(rootOrgId, fetched);
  }

  private async rootOrg(rootOrgId: string): Promise<TEntitlementOrg> {
    const org = await this.organizationsService.findOrganization(rootOrgId);
    return org ? { id: rootOrgId, name: org.name, slug: org.slug } : { id: rootOrgId };
  }

  private async cachePlan(rootOrgId: string, plan: Plan): Promise<Plan> {
    await this.planCache.write(rootOrgId, plan);
    return plan;
  }

  // Once stale or after a billing change, reads get the cached plan while one caller at a time refreshes it. A failed
  // refresh leaves the cached plan in place. The lock isn't released, so a billing change polls the License Server at
  // most once per lock TTL.
  private revalidateInBackground(rootOrgId: string) {
    void (async () => {
      if (!(await this.planCache.acquireRevalidateLock(rootOrgId))) return;
      await this.cachePlan(rootOrgId, await this.licensePolicyService.fetchPlan(await this.rootOrg(rootOrgId)));
    })().catch((error) => {
      logger.error(error, `getPlan: background revalidation failed [orgId=${rootOrgId}]`);
    });
  }
}
