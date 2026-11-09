import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import type { TCronJobFactory } from "@app/lib/cron/cron-job";
import type { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { logger } from "@app/lib/logger";
import type { TQueueServiceFactory } from "@app/queue";

import { PlanCache } from "./data-access/plan-cache";
import { UsageReportCache } from "./data-access/usage-report-cache";
import { InstanceType, TInstanceEntitlementsProps, TInstanceFeatures } from "./model/instance-entitlements";
import { TPlanFeature, TPlanProps } from "./model/plan";
import { SeatUsage } from "./model/seat-usage";
import { CounterRegistry } from "./service/counter-registry";
import { InstanceEntitlementsHolder } from "./service/instance-entitlements-holder";
import { TLicenseHooks } from "./service/license-hooks";
import { TLicenseServerBilling } from "./service/license-server-types/license-server-types";
import { OrganizationDirectory } from "./service/organization-directory";
import { PlanService, TRefreshPlanOptions } from "./service/plan-service";
import { TLicenseOrganizations, TUsageCounter } from "./service/registrations";
import { TMeteringEventInput, UsageQueue, UsageQueues } from "./service/usage-queue";
import { UsageService } from "./service/usage-service";

export * from "./model/instance-entitlements";
export * from "./model/meter";
export * from "./model/plan";
export * from "./model/seat-usage";
export type { TLicenseHooks } from "./service/license-hooks";
export * from "./service/license-server-types/license-server-types";
export * from "./service/license-server-types/usage-reports";
export type { TRefreshPlanOptions } from "./service/plan-service";
export type { TLicenseOrganizations, TUsageCounter } from "./service/registrations";
export type { TMeteringEventInput } from "./service/usage-queue";

export type TLicenseDomain = {
  getInstanceEntitlements: () => TInstanceEntitlementsProps;
  getInstanceType: () => InstanceType;
  hasInstanceFeature: (feature: keyof TInstanceFeatures) => boolean;
  // The offline license's id, or "unknown".
  getLicenseId: () => string;
  getPlan: (orgId: string) => Promise<TPlanProps>;
  hasFeature: (orgId: string, feature: TPlanFeature) => Promise<boolean>;
  // Refuses with a message naming the feature when the org's plan does not include it.
  assertFeature: (orgId: string, feature: TPlanFeature) => Promise<void>;
  // Fetches the plan again now; after a billing change, pass afterBillingChange to refresh in the background.
  refreshPlan: (orgId: string, opts?: TRefreshPlanOptions) => Promise<void>;
  // Drops the cached plan so the next read fetches it, without fetching now.
  invalidatePlan: (orgId: string) => Promise<void>;
  isServingFallbackPlan: (orgId: string) => Promise<boolean>;
  getLastKnownPlan: (orgId: string) => Promise<{ plan: TPlanProps; fetchedAt: number } | null>;
  // Seats in use for the org's plan: the root org's tree on cloud, the whole instance self-hosted. To enforce
  // a limit while adding a member, read this before the transaction and check it with seatUsage.assertAvailable.
  getSeatUsage: (orgId: string) => Promise<SeatUsage>;
  getInstanceSeatUsage: () => Promise<SeatUsage>;
  syncSeats: (orgId: string) => Promise<void>;
  cancelSubscription: (orgId: string) => Promise<void>;
  emit: (orgId: string, dimensionKey: string) => void;
  // The live count of a metered dimension for an org (on cloud) or the instance (self-hosted). Null when
  // nothing counts it.
  countUsage: (orgId: string, dimensionKey: string) => Promise<number | null>;
  recordMeteringEvents: (orgId: string, events: TMeteringEventInput[]) => void;
  // Whether LICENSE_KEY holds an offline key, whether or not it verifies.
  hasOfflineLicenseKey: () => boolean;
  billing: TLicenseServerBilling;
};

// How the domains License knows nothing about plug into it. Each is called once, while domains.ts builds
// the modules, before start().
export type TLicenseRegistry = {
  // A metered dimension's count, from the domain that owns the data it counts. One per dimension.
  registerUsageCounter: (counter: TUsageCounter) => void;
  // Root orgs and workspace counts, from the organizations domain. Exactly once.
  registerOrganizations: (organizations: TLicenseOrganizations) => void;
};

export type TLicenseDeps = {
  keyStore: TDomainKeyStore;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  cronJob: Pick<TCronJobFactory, "register">;
  isProductionMode: boolean;
  // Runs a task on a timer in this process. Supplied by the wiring: the timer module must not load with this one.
  startLocalRefresh: typeof startLocalRefresh;
  // Licensing policy and the License Server, from the EE edition. Required: CE has no defaults of its own.
  hooks: TLicenseHooks;
};

export class LicenseModule {
  readonly name = "license";

  readonly service: TLicenseDomain;

  readonly registry: TLicenseRegistry;

  // Exposed for the e2e suite's license overrides, which replace the instance entitlements in place.
  readonly instanceEntitlements = new InstanceEntitlementsHolder();

  private readonly hooks: TLicenseHooks;

  private readonly counters = new CounterRegistry();

  private readonly organizations = new OrganizationDirectory();

  private readonly plans: PlanService;

  private readonly usage: UsageService;

  private readonly usageQueue: UsageQueue;

  constructor(private readonly deps: TLicenseDeps) {
    this.hooks = deps.hooks;
    const instance = this.instanceEntitlements;
    const { hooks, counters, organizations } = this;
    const planCache = new PlanCache(deps.keyStore);
    const usageReportCache = new UsageReportCache(deps.keyStore);

    this.usageQueue = new UsageQueue({ queueService: deps.queueService, hooks, usageReportCache, counters });
    const { usageQueue } = this;
    this.plans = new PlanService({ instance, planCache, usageReportCache, organizations, hooks, usageQueue });
    this.usage = new UsageService({
      instance,
      counters,
      organizations,
      usageReportCache,
      usageQueue,
      hooks,
      planService: this.plans
    });
    this.registry = {
      registerUsageCounter: (counter) => this.counters.register(counter),
      registerOrganizations: (directory) => this.organizations.register(directory)
    };
    this.service = this.build();
  }

  // The meters a counter was registered for.
  usageDimensions(): string[] {
    return this.counters.all().map((counter) => counter.meter.key);
  }

  // Reads the instance's license, then starts the usage workers and the timers. Called once at boot.
  async start(): Promise<void> {
    this.instanceEntitlements.set(await this.hooks.resolveInstanceEntitlements());
    logger.info(`Instance type: ${this.instanceEntitlements.get().instanceType}`);

    this.deps.queueService.start(
      UsageQueues.usageEvent,
      (job) => this.usage.handleUsageEvent(job.data.orgId, job.data.dimensionKey, new Date(job.timestamp)),
      // Counts are DB-heavy, so a backlog is rate-shaped instead of bursting the read replica.
      { concurrency: 5, limiter: { max: 50, duration: 1000 } }
    );
    this.deps.queueService.start(
      UsageQueues.meteringEvent,
      (job) => this.usage.handleMeteringEvents(job.data.orgId, job.data.events),
      { concurrency: 5 }
    );

    this.deps.cronJob.register({
      name: "license-usage-flush",
      pattern: "0 0 * * *",
      runHashTtlS: 60 * 60,
      enabled: !this.instanceEntitlements.isCloud() && !this.hooks.isOffline(),
      handler: async () => this.usage.flushInstanceUsage()
    });
  }

  // Re-reads an online self-hosted license every ten minutes.
  startBackgroundSync() {
    if (!this.deps.isProductionMode || !this.hooks.hasOnlineLicense()) return undefined;
    logger.info("Setting up background sync process to refresh the instance license from License Server v2");
    return this.deps.startLocalRefresh({
      name: "self-hosted-license-sync",
      intervalMs: 10 * 60 * 1000,
      // A failure is thrown so startLocalRefresh logs it and records it as a failed run; the last
      // entitlements stay in place until a refresh succeeds.
      task: async () => {
        const refreshed = await this.hooks.refreshInstanceEntitlements();
        if (refreshed) this.instanceEntitlements.set(refreshed);
      }
    });
  }

  private build(): TLicenseDomain {
    const { plans, usage, usageQueue } = this;
    return {
      getInstanceEntitlements: () => plans.getInstanceEntitlements(),
      getInstanceType: () => plans.getInstanceType(),
      hasInstanceFeature: (feature) => plans.hasInstanceFeature(feature),
      getLicenseId: () => plans.getLicenseId(),
      getPlan: (orgId) => plans.getPlan(orgId),
      hasFeature: (orgId, feature) => plans.hasFeature(orgId, feature),
      assertFeature: (orgId, feature) => plans.assertFeature(orgId, feature),
      refreshPlan: (orgId, opts) => plans.refreshPlan(orgId, opts),
      invalidatePlan: (orgId) => plans.invalidatePlan(orgId),
      isServingFallbackPlan: (orgId) => plans.isServingFallbackPlan(orgId),
      getLastKnownPlan: (orgId) => plans.getLastKnownPlan(orgId),
      getSeatUsage: (orgId) => usage.getSeatUsage(orgId),
      getInstanceSeatUsage: () => usage.getInstanceSeatUsage(),
      countUsage: (orgId, dimensionKey) => usage.countUsage(orgId, dimensionKey),
      syncSeats: (orgId) => plans.syncSeats(orgId),
      cancelSubscription: (orgId) => plans.cancelSubscription(orgId),
      emit: (orgId, dimensionKey) => usageQueue.emit(orgId, dimensionKey),
      recordMeteringEvents: (orgId, events) => usageQueue.recordMeteringEvents(orgId, events),
      hasOfflineLicenseKey: () => this.hooks.isOffline(),
      billing: this.hooks.billing
    };
  }
}
