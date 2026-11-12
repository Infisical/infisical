import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import type { TCronJobFactory } from "@app/lib/cron/cron-job";
import type { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { logger } from "@app/lib/logger";
import type { TQueueServiceFactory } from "@app/queue";

import { PlanCache } from "./data-access/plan-cache";
import { UsageReportCache } from "./data-access/usage-report-cache";
import { InstanceEntitlements } from "./model/instance-entitlements";
import { CounterRegistry } from "./service/counter-registry";
import { TLicenseProvider, TLicenseServer, TUsageCounter } from "./service/dependencies";
import { InstanceEntitlementsHolder } from "./service/instance-entitlements-holder";
import { LicenseService, TLicenseService } from "./service/license-service";
import { seatUsageCounters } from "./service/seat-usage-counters";
import { TUsageMeteringService, UsageMeteringService } from "./service/usage-metering-service";
import { UsageQueue, UsageQueues } from "./service/usage-queue";
import { UsageReportWorker } from "./service/usage-report-worker";

export * from "./model/instance-entitlements";
export * from "./model/meter";
export * from "./model/plan";
export * from "./model/seat-usage";
export type { TLicenseService, TRefreshPlanOptions } from "./service/license-service";
export type {
  TCatalogProduct,
  TEntitlementOrg,
  TLicenseServerBilling,
  TProductLineItem,
  TSubscriptionPreviewPayload,
  TSubscriptionResponse
} from "./service/license-server-types/license-server-types";
export type {
  TLicenseProvider,
  TLicenseServer,
  TPlanCache,
  TUsageCounter,
  TUsageReportCache
} from "./service/dependencies";
export type { TUsageMeteringService } from "./service/usage-metering-service";
export type { TMeteringEventInput } from "./service/usage-queue";

export type TLicenseDeps = {
  keyStore: TDomainKeyStore;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  cronJob: Pick<TCronJobFactory, "register">;
  isProductionMode: boolean;
  // Injected because the timer module must not load with this one.
  startLocalRefresh: typeof startLocalRefresh;
  // From EE. Required: CE has no defaults of its own.
  provider: TLicenseProvider;
  licenseServer: TLicenseServer;
  organizationsProjectsService: TOrganizationsProjectsService;
  // One per product meter, from the domain that owns the data. Seat meters are built here.
  usageCounters: TUsageCounter[];
};

export class LicenseModule {
  readonly service: TLicenseService;

  readonly usageMeteringService: TUsageMeteringService;

  // Exposed for the e2e suite's license overrides.
  readonly instanceEntitlements: InstanceEntitlementsHolder;

  private readonly counters: CounterRegistry;

  private readonly worker: UsageReportWorker;

  static async create(deps: TLicenseDeps): Promise<LicenseModule> {
    const instanceEntitlements = await deps.provider.resolveInstanceEntitlements();
    logger.info(`Instance type: ${instanceEntitlements.instanceType}`);
    return new LicenseModule(deps, instanceEntitlements);
  }

  private constructor(
    private readonly deps: TLicenseDeps,
    instanceEntitlements: InstanceEntitlements
  ) {
    const { keyStore, organizationsProjectsService, provider, licenseServer } = deps;
    this.instanceEntitlements = new InstanceEntitlementsHolder(instanceEntitlements);
    const usageReportCache = new UsageReportCache(keyStore);
    this.counters = new CounterRegistry([...seatUsageCounters(organizationsProjectsService), ...deps.usageCounters]);

    const usageQueue = new UsageQueue({
      queueService: deps.queueService,
      licenseServer,
      usageReportCache,
      counters: this.counters
    });

    this.service = new LicenseService({
      instance: this.instanceEntitlements,
      planCache: new PlanCache(keyStore),
      usageReportCache,
      usageQueue,
      organizationsProjectsService,
      provider,
      licenseServer
    });
    this.usageMeteringService = new UsageMeteringService({
      counters: this.counters,
      usageQueue,
      licenseService: this.service,
      organizationsProjectsService
    });
    this.worker = new UsageReportWorker({
      counters: this.counters,
      usageReportCache,
      usageQueue,
      licenseService: this.service,
      licenseServer,
      organizationsProjectsService
    });
  }

  usageDimensions(): string[] {
    return this.counters.all().map((counter) => counter.meter.key);
  }

  // Call once at boot.
  start(): void {
    this.deps.queueService.start(
      UsageQueues.usageEvent,
      (job) => this.worker.handleUsageEvent(job.data.orgId, job.data.dimensionKey),
      // Counts are DB-heavy, so rate limit the backlog instead of hammering the read replica.
      { concurrency: 5, limiter: { max: 50, duration: 1000 } }
    );
    this.deps.queueService.start(
      UsageQueues.meteringEvent,
      (job) => this.worker.handleMeteringEvents(job.data.orgId, job.data.events),
      { concurrency: 5 }
    );

    this.deps.cronJob.register({
      name: "license-usage-flush",
      pattern: "0 0 * * *",
      runHashTtlS: 60 * 60,
      enabled: !this.instanceEntitlements.isCloud() && !this.deps.provider.isOffline(),
      handler: async () => this.worker.flushInstanceUsage()
    });
  }

  startBackgroundSync() {
    if (!this.deps.isProductionMode || !this.deps.provider.hasOnlineLicense()) return undefined;
    logger.info("Setting up background sync process to refresh the instance license from License Server v2");
    return this.deps.startLocalRefresh({
      name: "self-hosted-license-sync",
      intervalMs: 10 * 60 * 1000,
      // Throw on failure so startLocalRefresh logs it as a failed run. The last entitlements stay until a
      // refresh succeeds.
      task: async () => {
        const refreshed = await this.deps.provider.refreshInstanceEntitlements();
        if (refreshed) this.instanceEntitlements.set(refreshed);
      }
    });
  }
}
