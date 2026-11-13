import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import type { TCronJobFactory } from "@app/lib/cron/cron-job";
import type { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { logger } from "@app/lib/logger";
import type { TQueueServiceFactory } from "@app/queue";

import { InstanceEntitlementsCache } from "./data-access/instance-entitlements-cache";
import { PlanCache } from "./data-access/plan-cache";
import { UsageReportCache } from "./data-access/usage-report-cache";
import { InstanceEntitlements } from "./models/instance-entitlements";
import { TLicensePolicyService, TLicenseServer, TUsageCounter } from "./services/dependencies";
import { CounterRegistry, seatUsageCounters } from "./services/helpers/usage-counters";
import { UsageQueue, UsageQueues } from "./services/helpers/usage-queue";
import { LicenseService, TLicenseService } from "./services/license/service";
import { TUsageMeteringService, UsageMeteringService } from "./services/usage-metering/service";
import { TUsageReportService, UsageReportService } from "./services/usage-report/service";

export * from "./models/instance-entitlements";
export * from "./models/meter";
export * from "./models/plan";
export * from "./models/seat-usage";
export type { TLicenseService, TRefreshPlanOptions } from "./services/license/service";
export type {
  TCatalogProduct,
  TEntitlementOrg,
  TLicenseServerBilling,
  TProductLineItem,
  TSubscriptionPreviewPayload,
  TSubscriptionResponse
} from "./services/helpers/license-server-types";
export type {
  TLicensePolicyService,
  TLicenseServer,
  TPlanCache,
  TUsageCounter,
  TUsageReportCache
} from "./services/dependencies";
export type { TUsageMeteringService } from "./services/usage-metering/service";
export type { TMeteringEventInput } from "./services/usage-metering/service";

export type TLicenseDeps = {
  keyStore: TDomainKeyStore;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
  cronJob: Pick<TCronJobFactory, "register">;
  isProductionMode: boolean;
  // Injected because the timer module must not load with this one.
  startLocalRefresh: typeof startLocalRefresh;
  // From EE. Required: CE has no defaults of its own.
  licensePolicyService: TLicensePolicyService;
  licenseServer: TLicenseServer;
  organizationsProjectsService: TOrganizationsProjectsService;
  // One per product meter, from the domain that owns the data. Seat meters are built here.
  usageCounters: TUsageCounter[];
};

export class LicenseModule {
  readonly licenseService: TLicenseService;

  readonly usageMeteringService: TUsageMeteringService;

  private readonly counterRegistry: CounterRegistry;

  private readonly usageReportService: TUsageReportService;

  static async create(deps: TLicenseDeps): Promise<LicenseModule> {
    const instanceEntitlements = await deps.licensePolicyService.resolveInstanceEntitlements();
    logger.info(`Instance type: ${instanceEntitlements.instanceType}`);
    return new LicenseModule(deps, instanceEntitlements);
  }

  private constructor(
    private readonly deps: TLicenseDeps,
    instanceEntitlements: InstanceEntitlements
  ) {
    const { keyStore, organizationsProjectsService, licensePolicyService, licenseServer } = deps;
    const usageReportCache = new UsageReportCache(keyStore);
    this.counterRegistry = new CounterRegistry([
      ...seatUsageCounters(organizationsProjectsService),
      ...deps.usageCounters
    ]);

    const usageQueue = new UsageQueue(deps.queueService, licenseServer, usageReportCache, this.counterRegistry);

    this.licenseService = new LicenseService(
      new InstanceEntitlementsCache(instanceEntitlements),
      new PlanCache(keyStore),
      usageQueue,
      organizationsProjectsService,
      licensePolicyService,
      licenseServer
    );
    this.usageMeteringService = new UsageMeteringService(
      this.counterRegistry,
      usageQueue,
      this.licenseService,
      organizationsProjectsService
    );
    this.usageReportService = new UsageReportService(
      this.counterRegistry,
      usageReportCache,
      usageQueue,
      this.licenseService,
      licenseServer,
      organizationsProjectsService
    );
  }

  usageDimensions(): string[] {
    return this.counterRegistry.all().map((counter) => counter.meter.key);
  }

  // Call once at boot. Counts are DB-heavy, so the usage worker is rate limited to spare the read replica.
  start(): void {
    this.deps.queueService.start(
      UsageQueues.usageEvent,
      (job) => this.usageReportService.handleUsageEvent(job.data.orgId, job.data.dimensionKey),
      { concurrency: 5, limiter: { max: 50, duration: 1000 } }
    );
    this.deps.queueService.start(
      UsageQueues.meteringEvent,
      (job) => this.usageReportService.handleMeteringEvents(job.data.orgId, job.data.events),
      { concurrency: 5 }
    );

    this.deps.cronJob.register({
      name: "license-usage-flush",
      pattern: "0 0 * * *",
      runHashTtlS: 60 * 60,
      enabled: !this.licenseService.getInstanceEntitlements().isCloud() && !this.deps.licensePolicyService.isOffline(),
      handler: async () => this.usageReportService.flushInstanceUsage()
    });
  }

  // The task throws on failure so startLocalRefresh logs a failed run; the last entitlements stay until one succeeds.
  startBackgroundSync() {
    if (!this.deps.isProductionMode || !this.deps.licensePolicyService.hasOnlineLicense()) return undefined;
    logger.info("Setting up background sync process to refresh the instance license from License Server v2");
    return this.deps.startLocalRefresh({
      name: "self-hosted-license-sync",
      intervalMs: 10 * 60 * 1000,
      task: () => this.licenseService.refreshInstanceEntitlements()
    });
  }
}
