import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { InstanceType } from "../model/instance-entitlements";
import { CounterRegistry } from "./counter-registry";
import { TLicenseServer, TUsageReportCache, TUsageSource } from "./dependencies";
import { SELF_HOSTED_LICENSE_ORG_ID } from "./license-server-types/license-server-types";
import { TLicenseService } from "./license-service";
import { TMeteringEventPayload, UsageQueue } from "./usage-queue";

export type TUsageReportWorkerDeps = {
  counters: CounterRegistry;
  usageReportCache: TUsageReportCache;
  usageQueue: UsageQueue;
  licenseService: TLicenseService;
  licenseServer: TLicenseServer;
  organizationsProjectsService: TOrganizationsProjectsService;
};

// What the usage queues and the daily flush run. Only LicenseModule.start() registers these.
export class UsageReportWorker {
  constructor(private readonly deps: TUsageReportWorkerDeps) {}

  // Counts the meter and reports it only when the value changed since the last report.
  async handleUsageEvent(orgId: string, dimensionKey: string): Promise<void> {
    if (!this.deps.licenseServer.canReportUsage()) return;

    const cloud = this.isCloud();
    // On cloud an org with no paid plan (null slug) has no license on the server, so a report would only 404.
    if (cloud && !(await this.deps.licenseService.getPlan(orgId)).isPaid) return;

    const counter = this.deps.counters.get(dimensionKey);
    if (!counter) {
      logger.warn(`usage-metering: unknown metered feature, dropping event [dimensionKey=${dimensionKey}]`);
      return;
    }

    let reportOrgId = SELF_HOSTED_LICENSE_ORG_ID;
    if (cloud) {
      reportOrgId =
        counter.meter.scope === "org-tree"
          ? await this.deps.organizationsProjectsService.resolveRootOrgId(orgId)
          : orgId;
    }

    try {
      const value = await counter.count(cloud ? reportOrgId : null);
      // Stamped at counting, not at enqueue: a retried job counts again, and a new count sent under the
      // first attempt's time would be dropped by the server as a duplicate while recordReported keeps it.
      const observedAt = new Date();
      const lastReported = await this.deps.usageReportCache.lastReported(reportOrgId, dimensionKey);
      if (lastReported === value) return;

      const outcome = await this.deps.licenseServer.reportSnapshot(reportOrgId, {
        dimensionKey,
        value,
        observedAt,
        source: this.source
      });
      // The server's final answer for this dimension: not retried, and not recorded as reported.
      if (outcome !== "reported") {
        logger.info(
          `usage-event-queue: ${outcome === "no-license" ? "license not found" : "dimension not priced on this license"}, skipping [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}]`
        );
        return;
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
  // drop events nothing sends again.
  async handleMeteringEvents(orgId: string, events: TMeteringEventPayload): Promise<void> {
    if (!this.deps.licenseServer.canReportUsage() || !events.length) return;

    const reportOrgId = this.isCloud() ? orgId : SELF_HOSTED_LICENSE_ORG_ID;

    try {
      const outcome = await this.deps.licenseServer.reportEvents(reportOrgId, events, this.source);
      if (outcome.status === "rejected") {
        logger.warn(
          `usage-event-queue: metering events rejected, dropping [orgId=${reportOrgId}] [count=${events.length}] [reason=${outcome.reason}]`
        );
        return;
      }
      logger.info(
        `usage-event-queue: reported metering events [orgId=${reportOrgId}] [count=${outcome.accepted + outcome.deduped}] [deduped=${outcome.deduped}]`
      );
    } catch (error) {
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

  private isCloud() {
    return this.deps.licenseService.getInstanceType() === InstanceType.Cloud;
  }

  private get source(): TUsageSource {
    return this.isCloud() ? "cloud" : "self-hosted";
  }
}
