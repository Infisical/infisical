import { EntityNotFoundError, ExternalSystemError } from "@app/domains/lib/errors";
import { logger } from "@app/lib/logger";

import { InstanceType, TInstanceEntitlementsProps } from "../model/instance-entitlements";
import { Meter } from "../model/meter";
import { Plan } from "../model/plan";
import { SeatUsage } from "../model/seat-usage";
import { CounterRegistry } from "./counter-registry";
import { TLicenseOrganizations, TLicenseProvider, TLicenseServer, TPlanCache, TUsageReportCache } from "./dependencies";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import {
  SELF_HOSTED_LICENSE_ORG_ID,
  TEntitlementOrg,
  TOrgDeletedResult
} from "./license-server-types/license-server-types";
import { TUsageEvent, UsageReportError } from "./license-server-types/usage-reports";
import { TMeteringEventInput, TMeteringEventPayload, UsageQueue } from "./usage-queue";

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
  // Call after the change to the org's members commits.
  syncSeats(orgId: string): Promise<void>;
  // The live count of a metered dimension for an org (on cloud) or the instance (self-hosted). Null when
  // nothing counts it.
  countUsage(orgId: string, dimensionKey: string): Promise<number | null>;
  // Queues a report of the dimension's count. Never throws: the metered write has already happened.
  emit(orgId: string, dimensionKey: string): void;
  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void;
};

export type TLicenseServiceDeps = {
  instance: InstanceEntitlementsHolder;
  counters: CounterRegistry;
  planCache: TPlanCache;
  usageReportCache: TUsageReportCache;
  usageQueue: UsageQueue;
  organizations: TLicenseOrganizations;
  provider: TLicenseProvider;
  licenseServer: TLicenseServer;
};

// The worker handlers are public but not on TLicenseService: only LicenseModule.start() should call them.
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
    const rootOrgId = await this.deps.organizations.findRootOrgId(orgId);
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
      const rootOrgId = await this.deps.organizations.resolveRootOrgId(orgId);
      try {
        await this.deps.planCache.markForRevalidation(rootOrgId, Boolean(opts.afterBillingChange.checkout));
      } catch (error) {
        logger.error(error, `refreshPlan: failed to mark the plan for revalidation [orgId=${orgId}]`);
      }
      return;
    }
    if (this.deps.instance.isCloud()) {
      const rootOrgId = await this.deps.organizations.findRootOrgId(orgId);
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
    await this.deps.planCache.invalidate(await this.deps.organizations.resolveRootOrgId(orgId));
  }

  async isServingFallbackPlan(orgId: string): Promise<boolean> {
    if (!this.deps.instance.isCloud()) return false;
    return this.deps.planCache.isFallback(await this.deps.organizations.resolveRootOrgId(orgId));
  }

  async getLastKnownPlan(orgId: string): Promise<{ plan: Plan; fetchedAt: number } | null> {
    return this.deps.planCache.lastKnown(await this.deps.organizations.resolveRootOrgId(orgId));
  }

  async closeDeletedOrg(orgId: string): Promise<TOrgDeletedResult> {
    const result = await this.deps.licenseServer.deleteOrganization(orgId);
    await this.deps.planCache.invalidate(orgId);
    return result;
  }

  async getSeatUsage(orgId: string): Promise<SeatUsage> {
    if (!this.deps.instance.isCloud()) return this.countSeats(null);
    const rootOrgId = await this.deps.organizations.findRootOrgId(orgId);
    if (!rootOrgId) throw new EntityNotFoundError({ message: `Organization with ID '${orgId}' not found` });
    return this.countSeats(rootOrgId);
  }

  // Every org on the instance, which is what an instance-wide identity limit caps.
  getInstanceSeatUsage(): Promise<SeatUsage> {
    return this.countSeats(null);
  }

  // Reports the new seat count and refreshes the plan, which carries it. A failure is logged rather than
  // thrown, since the change it follows has committed.
  async syncSeats(orgId: string): Promise<void> {
    try {
      const rootOrgId = await this.deps.organizations.resolveRootOrgId(orgId);
      this.deps.usageQueue.emit(rootOrgId, Meter.UserIdentities.key);
      await this.refreshPlan(rootOrgId);
    } catch (error) {
      logger.error(error, `syncSeats: failed to sync seats [orgId=${orgId}]`);
    }
  }

  async countUsage(orgId: string, dimensionKey: string): Promise<number | null> {
    const counter = this.deps.counters.get(dimensionKey);
    if (!counter) return null;
    return counter.count(this.deps.instance.isCloud() ? orgId : null);
  }

  emit(orgId: string, dimensionKey: string): void {
    this.deps.usageQueue.emit(orgId, dimensionKey);
  }

  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void {
    this.deps.usageQueue.recordMeteringEvents(orgId, events);
  }

  // Counts the meter and reports it only when the value changed since the last report.
  async handleUsageEvent(orgId: string, dimensionKey: string): Promise<void> {
    if (!this.deps.licenseServer.canReportUsage()) return;

    const cloud = this.deps.instance.isCloud();
    // On cloud an org with no paid plan (null slug) has no license on the server, so a report would only 404.
    if (cloud && !(await this.getPlan(orgId)).isPaid) return;

    const counter = this.deps.counters.get(dimensionKey);
    if (!counter) {
      logger.warn(`usage-metering: unknown metered feature, dropping event [dimensionKey=${dimensionKey}]`);
      return;
    }

    let reportOrgId = SELF_HOSTED_LICENSE_ORG_ID;
    if (cloud) {
      reportOrgId = counter.meter.scope === "org-tree" ? await this.deps.organizations.resolveRootOrgId(orgId) : orgId;
    }

    try {
      const value = await counter.count(cloud ? reportOrgId : null);
      // Stamped at counting, not at enqueue: a retried job counts again, and a new count sent under the
      // first attempt's key would be dropped by the server as a duplicate while recordReported keeps it.
      const observedAt = new Date();
      const lastReported = await this.deps.usageReportCache.lastReported(reportOrgId, dimensionKey);
      if (lastReported === value) return;

      try {
        await this.deps.licenseServer.reportSnapshots(reportOrgId, [
          {
            dimension_key: dimensionKey,
            value,
            observed_at: observedAt.toISOString(),
            idempotency_key: `${this.source}:${reportOrgId}:${dimensionKey}:${observedAt.getTime()}`,
            source: this.source
          }
        ]);
      } catch (error) {
        // A 404 "license not found" or a 422 "not priced" is the server's final answer for this dimension, so
        // it is not retried and not recorded as reported.
        if (error instanceof UsageReportError) {
          if (error.status === 404 && error.serverMessage.includes("license not found")) {
            logger.info(
              `usage-event-queue: license not found, skipping [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}]`
            );
            return;
          }
          if (
            error.status === 422 &&
            error.serverMessage.includes("not priced by any active product on this license")
          ) {
            logger.info(
              `usage-event-queue: dimension not priced on this license, skipping [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}]`
            );
            return;
          }
        }
        throw error;
      }

      logger.info(
        `usage-event-queue: reported usage event [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}] [value=${value}]`
      );
      await this.deps.usageReportCache.recordReported(reportOrgId, dimensionKey, value);
    } catch (error) {
      logger.error(
        error,
        `usage-event-queue: failed to handle usage event [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}]`
      );
      throw error;
    }
  }

  // No plan-slug gate as in handleUsageEvent: during an outage the plan is a slugless fallback, which would
  // drop events nothing sends again. A 404 "license not found" or any 422 is final for the batch.
  async handleMeteringEvents(orgId: string, events: TMeteringEventPayload): Promise<void> {
    if (!this.deps.licenseServer.canReportUsage() || !events.length) return;

    const reportOrgId = this.deps.instance.isCloud() ? orgId : SELF_HOSTED_LICENSE_ORG_ID;
    const payload: TUsageEvent[] = events.map((e) => ({
      event_id: e.eventId,
      dimension_key: e.dimensionKey,
      quantity: e.quantity,
      occurred_at: e.occurredAt,
      source: this.source
    }));

    try {
      const results = await this.deps.licenseServer.reportEvents(reportOrgId, payload);
      logger.info(
        `usage-event-queue: reported metering events [orgId=${reportOrgId}] [count=${results.length}] [deduped=${
          results.filter((r) => r.status === "deduped").length
        }]`
      );
    } catch (error) {
      if (
        error instanceof UsageReportError &&
        (error.status === 422 || (error.status === 404 && error.serverMessage.includes("license not found")))
      ) {
        logger.warn(
          `usage-event-queue: metering events rejected, dropping [orgId=${reportOrgId}] [count=${events.length}] [status=${error.status}] [message=${error.serverMessage}]`
        );
        return;
      }
      logger.error(error, `usage-event-queue: failed to report metering events [orgId=${reportOrgId}]`);
      throw error;
    }
  }

  // Self-hosted true-up: a daily backstop on top of event-driven reports. Each meter is emitted once at the
  // instance identity, where it counts the whole instance and is skipped when unchanged.
  flushInstanceUsage(): void {
    if (!this.deps.licenseServer.canReportUsage()) return;
    this.deps.usageQueue.emitAll(SELF_HOSTED_LICENSE_ORG_ID);
  }

  private async countSeats(orgId: string | null): Promise<SeatUsage> {
    const { users, identities } = await this.deps.organizations.countBillableOrgActors(orgId);
    return SeatUsage.create({ membersUsed: users, identitiesUsed: users + identities });
  }

  private get source() {
    return this.deps.instance.isCloud() ? "cloud" : "self-hosted";
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
    const org = await this.deps.organizations.findOrganization(rootOrgId);
    return org ? { id: rootOrgId, name: org.name, slug: org.slug } : { id: rootOrgId };
  }

  private async cachePlan(rootOrgId: string, fetched: Plan): Promise<Plan> {
    const plan = fetched.withWorkspacesUsed(await this.deps.organizations.countWorkspaces(rootOrgId));
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
