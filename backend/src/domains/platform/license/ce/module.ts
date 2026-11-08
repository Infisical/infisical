import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TTransaction } from "@app/domains/lib/transaction-runner";
import type { TCronJobFactory } from "@app/lib/cron/cron-job";
import type { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { logger } from "@app/lib/logger";
import type { TQueueServiceFactory } from "@app/queue";

import { getDefaultOnPremFeatures } from "./model/default-features";
import { TLicenseServerBilling } from "./model/license-server-types";
import { InstanceType, TFeatureSet, TOrgSeatUsage } from "./model/license-types";
import { TInstanceEntitlements, TPlan, TPlanFeature } from "./model/plan";
import { TLicenseOrganizations } from "./model/root-org";
import { TUsageCounter } from "./model/usage-counter";
import { UsageQueues } from "./model/usage-queues";
import { CounterRegistry } from "./service/counter-registry";
import { dormantBilling } from "./service/dormant-billing";
import { EntitlementService } from "./service/entitlement-service";
import { InstanceEntitlementsHolder } from "./service/instance-entitlements-holder";
import { TLicenseHooks } from "./service/license-hooks";
import { OrganizationDirectory } from "./service/organization-directory";
import { PlanCache } from "./service/plan-cache";
import { PlanResolver, TRefreshPlanOptions } from "./service/plan-resolver";
import { SubscriptionService } from "./service/subscription-service";
import { UsageQueue, TMeteringEventInput } from "./service/usage-queue";
import { UsageReportService } from "./service/usage-report-service";
import { TAssertSeatAvailableInput, UsageService } from "./service/usage-service";

export * from "./model/default-features";
export * from "./model/license-server-types";
export * from "./model/license-types";
export * from "./model/metered-features";
export * from "./model/plan";
export type { TLicenseOrganizations, TRootOrg } from "./model/root-org";
export type { TUsageCounter, TUsageCounterScope } from "./model/usage-counter";
export * from "./model/usage-report";
export type { TLicenseHooks } from "./service/license-hooks";
export type { TRefreshPlanOptions } from "./service/plan-resolver";
export type { TMeteringEventInput } from "./service/usage-queue";
export type { TAssertSeatAvailableInput } from "./service/usage-service";

export type TLicenseDomain = {
  getInstanceEntitlements: () => TInstanceEntitlements;
  getInstanceType: () => InstanceType;
  hasInstanceFeature: (feature: keyof TFeatureSet) => boolean;
  // The offline license's id, or "unknown".
  getLicenseId: () => string;
  getPlan: (orgId: string) => Promise<TPlan>;
  hasFeature: (orgId: string, feature: TPlanFeature) => Promise<boolean>;
  // Refuses with a message naming the feature when the org's plan does not include it.
  assertFeature: (orgId: string, feature: TPlanFeature) => Promise<void>;
  // Fetches the plan again now; after a billing change, pass afterBillingChange to refresh in the background.
  refreshPlan: (orgId: string, opts?: TRefreshPlanOptions) => Promise<void>;
  // Drops the cached plan so the next read fetches it, without fetching now.
  invalidatePlan: (orgId: string) => Promise<void>;
  isServingFallbackPlan: (orgId: string) => Promise<boolean>;
  getLastKnownPlan: (orgId: string) => Promise<{ plan: TPlan; fetchedAt: number } | null>;
  getSeatUsage: (orgId: string) => Promise<TOrgSeatUsage>;
  assertSeatAvailable: (input: TAssertSeatAvailableInput) => Promise<void>;
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
  // For code under src/services/ that holds a Knex transaction: seat counts then read on that transaction.
  // Wrap the transaction with sealKnexTransaction.
  within: (tx: TTransaction) => TLicenseDomain;
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
  hooks?: TLicenseHooks;
};

const communityHooks: TLicenseHooks = {
  resolveInstanceEntitlements: async () => ({
    instanceType: InstanceType.OnPrem,
    features: getDefaultOnPremFeatures(),
    licenseId: null,
    customerId: null
  }),
  refreshInstanceEntitlements: async () => null,
  hasOnlineLicense: () => false,
  fetchPlan: () => Promise.reject(new Error("No License Server in the community edition")),
  fallbackPlan: (features) => features,
  cancelSubscription: async () => undefined,
  isMeteringEnabled: () => false,
  usageReporter: null,
  isOffline: () => false,
  billing: dormantBilling
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

  private readonly planCache: PlanCache;

  private readonly usageQueue: UsageQueue;

  private readonly planResolver: PlanResolver;

  private readonly entitlements: EntitlementService;

  private readonly subscription: SubscriptionService;

  private readonly usageReports: UsageReportService;

  constructor(private readonly deps: TLicenseDeps) {
    this.hooks = deps.hooks ?? communityHooks;
    this.planCache = new PlanCache(deps.keyStore);
    this.usageQueue = new UsageQueue({
      queueService: deps.queueService,
      hooks: this.hooks,
      planCache: this.planCache,
      counters: this.counters
    });
    this.planResolver = new PlanResolver({
      instance: this.instanceEntitlements,
      planCache: this.planCache,
      organizations: this.organizations,
      hooks: this.hooks,
      usageQueue: this.usageQueue
    });
    this.entitlements = new EntitlementService({
      instance: this.instanceEntitlements,
      planCache: this.planCache,
      organizations: this.organizations,
      planResolver: this.planResolver
    });
    this.subscription = new SubscriptionService({
      instance: this.instanceEntitlements,
      planCache: this.planCache,
      organizations: this.organizations,
      planResolver: this.planResolver,
      usageQueue: this.usageQueue,
      hooks: this.hooks
    });
    this.usageReports = new UsageReportService({
      instance: this.instanceEntitlements,
      counters: this.counters,
      organizations: this.organizations,
      planCache: this.planCache,
      planResolver: this.planResolver,
      usageQueue: this.usageQueue,
      hooks: this.hooks
    });
    this.registry = {
      registerUsageCounter: (counter) => this.counters.register(counter),
      registerOrganizations: (organizations) => this.organizations.register(organizations)
    };
    this.service = this.build(this.usageService());
  }

  // Only seat and usage counts read the database, so they are the only part bound to the transaction.
  within(tx: TTransaction): TLicenseDomain {
    return this.build(this.usageService(tx));
  }

  // The metered dimensions a counter was registered for.
  usageDimensions(): string[] {
    return this.counters.all().map((counter) => counter.feature.key);
  }

  // Reads the instance's license, then starts the usage workers and the timers. Called once at boot.
  async start(): Promise<void> {
    this.instanceEntitlements.set(await this.hooks.resolveInstanceEntitlements());
    logger.info(`Instance type: ${this.instanceEntitlements.get().instanceType}`);

    this.deps.queueService.start(
      UsageQueues.usageEvent,
      (job) => this.usageReports.handleUsageEvent(job.data.orgId, job.data.dimensionKey, new Date(job.timestamp)),
      // Counts are DB-heavy, so a backlog is rate-shaped instead of bursting the read replica.
      { concurrency: 5, limiter: { max: 50, duration: 1000 } }
    );
    this.deps.queueService.start(
      UsageQueues.meteringEvent,
      (job) => this.usageReports.handleMeteringEvents(job.data.orgId, job.data.events),
      { concurrency: 5 }
    );

    this.deps.cronJob.register({
      name: "license-usage-flush",
      pattern: "0 0 * * *",
      runHashTtlS: 60 * 60,
      enabled: !this.instanceEntitlements.isCloud() && !this.hooks.isOffline(),
      handler: async () => this.usageReports.flushInstanceUsage()
    });
  }

  // Re-reads an online self-hosted license every ten minutes.
  startBackgroundSync() {
    if (!this.deps.isProductionMode || !this.hooks.hasOnlineLicense()) return undefined;
    logger.info("Setting up background sync process to refresh the instance license from License Server v2");
    return this.deps.startLocalRefresh({
      name: "self-hosted-license-sync",
      intervalMs: 10 * 60 * 1000,
      task: async () => {
        try {
          const refreshed = await this.hooks.refreshInstanceEntitlements();
          if (refreshed) this.instanceEntitlements.set(refreshed);
        } catch (error) {
          logger.error(error, "Failed to sync self-hosted license features from License Server v2");
        }
      }
    });
  }

  private usageService(tx?: TTransaction) {
    return new UsageService({
      instance: this.instanceEntitlements,
      counters: this.counters,
      organizations: this.organizations,
      tx
    });
  }

  private build(usage: UsageService): TLicenseDomain {
    const { entitlements, subscription, usageQueue } = this;
    return {
      getInstanceEntitlements: () => entitlements.getInstanceEntitlements(),
      getInstanceType: () => entitlements.getInstanceType(),
      hasInstanceFeature: (feature) => entitlements.hasInstanceFeature(feature),
      getLicenseId: () => entitlements.getLicenseId(),
      getPlan: (orgId) => entitlements.getPlan(orgId),
      hasFeature: (orgId, feature) => entitlements.hasFeature(orgId, feature),
      assertFeature: (orgId, feature) => entitlements.assertFeature(orgId, feature),
      refreshPlan: (orgId, opts) => entitlements.refreshPlan(orgId, opts),
      invalidatePlan: (orgId) => entitlements.invalidatePlan(orgId),
      isServingFallbackPlan: (orgId) => entitlements.isServingFallbackPlan(orgId),
      getLastKnownPlan: (orgId) => entitlements.getLastKnownPlan(orgId),
      getSeatUsage: (orgId) => usage.getSeatUsage(orgId),
      assertSeatAvailable: (input) => usage.assertSeatAvailable(input),
      countUsage: (orgId, dimensionKey) => usage.countUsage(orgId, dimensionKey),
      syncSeats: (orgId) => subscription.syncSeats(orgId),
      cancelSubscription: (orgId) => subscription.cancelSubscription(orgId),
      emit: (orgId, dimensionKey) => usageQueue.emit(orgId, dimensionKey),
      recordMeteringEvents: (orgId, events) => usageQueue.recordMeteringEvents(orgId, events),
      hasOfflineLicenseKey: () => this.hooks.isOffline(),
      billing: this.hooks.billing,
      within: (tx) => this.within(tx)
    };
  }
}
