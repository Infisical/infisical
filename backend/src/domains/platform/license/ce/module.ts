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
import { TRootOrg } from "./model/root-org";
import { TUsageCounter } from "./model/usage-counter";
import { UsageQueues } from "./model/usage-queues";
import { CounterRegistry } from "./service/counter-registry";
import { dormantBilling } from "./service/dormant-billing";
import { EntitlementService } from "./service/entitlement-service";
import { InstanceEntitlementsHolder } from "./service/instance-entitlements-holder";
import { SELF_HOSTED_LICENSE_ORG_ID, TLicenseContext, TLicenseState } from "./service/license-context";
import { TLicenseHooks } from "./service/license-hooks";
import { PlanCache } from "./service/plan-cache";
import { RootOrgCache } from "./service/root-org-cache";
import { SubscriptionService } from "./service/subscription-service";
import { TMeteringEventInput, UsageService } from "./service/usage-service";

export * from "./model/default-features";
export * from "./model/license-server-types";
export * from "./model/license-types";
export * from "./model/metered-features";
export * from "./model/plan";
export type { TRootOrg } from "./model/root-org";
export type { TUsageCounter, TUsageCounterScope } from "./model/usage-counter";
export * from "./model/usage-report";
export type { TLicenseHooks } from "./service/license-hooks";
export type { TMeteringEventInput } from "./service/usage-service";
export { SELF_HOSTED_LICENSE_ORG_ID };

export type TLicenseService = {
  getInstanceEntitlements: () => TInstanceEntitlements;
  getInstanceType: () => InstanceType;
  hasInstanceFeature: (feature: keyof TFeatureSet) => boolean;
  // The offline license's id, or "unknown".
  getLicenseId: () => string;
  getPlan: (orgId: string) => Promise<TPlan>;
  hasFeature: (orgId: string, feature: TPlanFeature) => Promise<boolean>;
  // Refuses with a message naming the feature when the org's plan does not include it.
  assertFeature: (orgId: string, feature: TPlanFeature) => Promise<void>;
  refreshPlan: (orgId: string) => Promise<void>;
  // Drops the cached plan so the next read fetches it, without fetching now.
  invalidatePlan: (orgId: string) => Promise<void>;
  isServingFallbackPlan: (orgId: string) => Promise<boolean>;
  getLastKnownPlan: (orgId: string) => Promise<{ plan: TPlan; fetchedAt: number } | null>;
  getSeatUsage: (orgId: string) => Promise<TOrgSeatUsage>;
  assertSeatAvailable: (input: { orgId: string; identityLimit: number | null; via?: string }) => Promise<void>;
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
  within: (tx: TTransaction) => TLicenseService;
};

export type TLicenseDeps = {
  keyStore: TDomainKeyStore;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  cronJob: Pick<TCronJobFactory, "register">;
  resolveRootOrg: (orgId: string) => Promise<TRootOrg | null>;
  countBillableProjects: (rootOrgId: string) => Promise<number>;
  // Each metered dimension's count, from the domain that owns the data it counts.
  counters: TUsageCounter[];
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

  readonly service: TLicenseService;

  // Exposed for the e2e suite's license overrides, which replace the instance entitlements in place.
  readonly instanceEntitlements: InstanceEntitlementsHolder;

  private readonly state: TLicenseState;

  private readonly hooks: TLicenseHooks;

  private readonly worker: UsageService;

  constructor(private readonly deps: TLicenseDeps) {
    this.hooks = deps.hooks ?? communityHooks;
    this.instanceEntitlements = new InstanceEntitlementsHolder();
    this.state = {
      instance: this.instanceEntitlements,
      planCache: new PlanCache(deps.keyStore),
      rootOrgs: new RootOrgCache(deps.resolveRootOrg),
      counters: new CounterRegistry(deps.counters)
    };
    this.service = this.build();
    this.worker = new UsageService(this.context());
  }

  within(tx: TTransaction): TLicenseService {
    return this.build(tx);
  }

  // Reads the instance's license, then starts the usage workers and the timers. Called once at boot.
  async start(): Promise<void> {
    this.state.instance.set(await this.hooks.resolveInstanceEntitlements());
    logger.info(`Instance type: ${this.state.instance.get().instanceType}`);

    this.deps.queueService.start(
      UsageQueues.usageEvent,
      (job) => this.worker.handleUsageEvent(job.data.orgId, job.data.dimensionKey, new Date(job.timestamp)),
      // Counts are DB-heavy, so a backlog is rate-shaped instead of bursting the read replica.
      { concurrency: 5, limiter: { max: 50, duration: 1000 } }
    );
    this.deps.queueService.start(
      UsageQueues.meteringEvent,
      (job) => this.worker.handleMeteringEvents(job.data.orgId, job.data.events),
      { concurrency: 5 }
    );

    const { instanceType } = this.state.instance.get();
    this.deps.cronJob.register({
      name: "license-usage-flush",
      pattern: "0 0 * * *",
      runHashTtlS: 60 * 60,
      enabled: instanceType !== InstanceType.Cloud && !this.hooks.isOffline(),
      handler: async () => this.worker.flushInstanceUsage()
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
          if (refreshed) this.state.instance.set(refreshed);
        } catch (error) {
          logger.error(error, "Failed to sync self-hosted license features from License Server v2");
        }
      }
    });
  }

  private context(tx?: TTransaction): TLicenseContext {
    return {
      state: this.state,
      hooks: this.hooks,
      queueService: this.deps.queueService,
      countBillableProjects: this.deps.countBillableProjects,
      tx
    };
  }

  private build(tx?: TTransaction): TLicenseService {
    const ctx = this.context(tx);
    const entitlements = new EntitlementService(ctx);
    const usage = new UsageService(ctx);
    const subscription = new SubscriptionService(ctx);
    return {
      getInstanceEntitlements: () => entitlements.getInstanceEntitlements(),
      getInstanceType: () => entitlements.getInstanceType(),
      hasInstanceFeature: (feature) => entitlements.hasInstanceFeature(feature),
      getLicenseId: () => entitlements.getLicenseId(),
      getPlan: (orgId) => entitlements.getPlan(orgId),
      hasFeature: (orgId, feature) => entitlements.hasFeature(orgId, feature),
      assertFeature: (orgId, feature) => entitlements.assertFeature(orgId, feature),
      refreshPlan: (orgId) => entitlements.refreshPlan(orgId),
      invalidatePlan: (orgId) => entitlements.invalidatePlan(orgId),
      isServingFallbackPlan: (orgId) => entitlements.isServingFallbackPlan(orgId),
      getLastKnownPlan: (orgId) => entitlements.getLastKnownPlan(orgId),
      getSeatUsage: (orgId) => usage.getSeatUsage(orgId),
      assertSeatAvailable: (input) => usage.assertSeatAvailable(input),
      syncSeats: (orgId) => subscription.syncSeats(orgId),
      cancelSubscription: (orgId) => subscription.cancelSubscription(orgId),
      emit: (orgId, dimensionKey) => usage.emit(orgId, dimensionKey),
      recordMeteringEvents: (orgId, events) => usage.recordMeteringEvents(orgId, events),
      countUsage: (orgId, dimensionKey) => usage.countUsage(orgId, dimensionKey),
      hasOfflineLicenseKey: () => this.hooks.isOffline(),
      billing: this.hooks.billing,
      within: (boundTx) => this.build(boundTx)
    };
  }
}
