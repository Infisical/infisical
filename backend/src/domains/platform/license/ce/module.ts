import type { TDomainKeyStore } from "@app/domains/lib/key-store";
import type { TCronJobFactory } from "@app/lib/cron/cron-job";
import type { startLocalRefresh } from "@app/lib/cron/local-refresh";
import { logger } from "@app/lib/logger";
import type { TQueueServiceFactory } from "@app/queue";

import { PlanCache } from "./data-access/plan-cache";
import { UsageReportCache } from "./data-access/usage-report-cache";
import { CounterRegistry } from "./service/counter-registry";
import { TLicenseOrganizations, TLicenseProvider, TLicenseServer, TUsageCounter } from "./service/dependencies";
import { InstanceEntitlementsHolder } from "./service/instance-entitlements-holder";
import { LicenseService, TLicenseService } from "./service/license-service";
import { TUsageMeteringService, UsageMeteringService } from "./service/usage-metering-service";
import { UsageQueue, UsageQueues } from "./service/usage-queue";
import { UsageReportWorker } from "./service/usage-report-worker";

export * from "./model/instance-entitlements";
export * from "./model/meter";
export * from "./model/plan";
export * from "./model/seat-usage";
export type { TLicenseService, TRefreshPlanOptions } from "./service/license-service";
export * from "./service/license-server-types/license-server-types";
export * from "./service/license-server-types/usage-reports";
export type {
  TLicenseOrganizations,
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
  // Runs a task on a timer in this process. Supplied by the wiring: the timer module must not load with this one.
  startLocalRefresh: typeof startLocalRefresh;
  // Licensing policy and the License Server, from the EE edition. Required: CE has no defaults of its own.
  provider: TLicenseProvider;
  licenseServer: TLicenseServer;
  // Root orgs, workspace and seat counts, from the organizations-projects domain.
  organizations: TLicenseOrganizations;
  // One per Meter, each from the domain that owns the data it counts.
  usageCounters: TUsageCounter[];
};

export class LicenseModule {
  // Entitlements: plans, the instance's license and seat usage.
  readonly service: TLicenseService;

  // Reporting usage to the License Server.
  readonly usageMeteringService: TUsageMeteringService;

  // Exposed for the e2e suite's license overrides, which replace the instance entitlements in place.
  readonly instanceEntitlements = new InstanceEntitlementsHolder();

  private readonly counters: CounterRegistry;

  private readonly worker: UsageReportWorker;

  constructor(private readonly deps: TLicenseDeps) {
    const { keyStore, organizations, provider, licenseServer } = deps;
    const usageReportCache = new UsageReportCache(keyStore);
    this.counters = new CounterRegistry(deps.usageCounters);

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
      organizations,
      provider,
      licenseServer
    });
    this.usageMeteringService = new UsageMeteringService({
      counters: this.counters,
      usageQueue,
      licenseService: this.service,
      organizations
    });
    this.worker = new UsageReportWorker({
      counters: this.counters,
      usageReportCache,
      usageQueue,
      licenseService: this.service,
      licenseServer,
      organizations
    });
  }

  // The meters a counter was given for.
  usageDimensions(): string[] {
    return this.counters.all().map((counter) => counter.meter.key);
  }

  // Reads the instance's license, then starts the usage workers and the timers. Called once at boot.
  async start(): Promise<void> {
    this.instanceEntitlements.set(await this.deps.provider.resolveInstanceEntitlements());
    logger.info(`Instance type: ${this.instanceEntitlements.get().instanceType}`);

    this.deps.queueService.start(
      UsageQueues.usageEvent,
      (job) => this.worker.handleUsageEvent(job.data.orgId, job.data.dimensionKey),
      // Counts are DB-heavy, so a backlog is rate-shaped instead of bursting the read replica.
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

  // Re-reads an online self-hosted license every ten minutes.
  startBackgroundSync() {
    if (!this.deps.isProductionMode || !this.deps.provider.hasOnlineLicense()) return undefined;
    logger.info("Setting up background sync process to refresh the instance license from License Server v2");
    return this.deps.startLocalRefresh({
      name: "self-hosted-license-sync",
      intervalMs: 10 * 60 * 1000,
      // A failure is thrown so startLocalRefresh logs it and records it as a failed run; the last
      // entitlements stay in place until a refresh succeeds.
      task: async () => {
        const refreshed = await this.deps.provider.refreshInstanceEntitlements();
        if (refreshed) this.instanceEntitlements.set(refreshed);
      }
    });
  }
}
