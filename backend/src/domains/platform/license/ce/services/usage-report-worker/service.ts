import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { InstanceType } from "../../models/instance-entitlements";
import { Meter } from "../../models/meter";
import { TLicenseServer, TUsageReportCache, TUsageSource } from "../dependencies";
import { CounterRegistry } from "../helpers/counter-registry";
import { SELF_HOSTED_LICENSE_ORG_ID } from "../helpers/license-server-types";
import { TMeteringEventPayload, UsageQueue } from "../helpers/usage-queue";
import { TLicenseService } from "../license/service";

export type TUsageReportWorkerService = {
  handleUsageEvent(orgId: string, dimensionKey: string): Promise<void>;
  handleMeteringEvents(orgId: string, events: TMeteringEventPayload): Promise<void>;
  flushInstanceUsage(): void;
};

export type TUsageReportWorkerServiceDeps = {
  counters: CounterRegistry;
  usageReportCache: TUsageReportCache;
  usageQueue: UsageQueue;
  licenseService: TLicenseService;
  licenseServer: TLicenseServer;
  organizationsProjectsService: TOrganizationsProjectsService;
};

// Only LicenseModule.start() registers these.
export class UsageReportWorkerService implements TUsageReportWorkerService {
  constructor(private readonly deps: TUsageReportWorkerServiceDeps) {}

  async handleUsageEvent(orgId: string, dimensionKey: string): Promise<void> {
    if (!this.deps.licenseServer.canReportUsage()) return;

    const cloud = this.isCloud();
    // On cloud an unpaid org has no license on the server, so a report would just 404.
    if (cloud && !(await this.deps.licenseService.getPlan(orgId)).isPaid) return;

    const meter = Meter.fromKey(dimensionKey);
    const counter = meter && this.deps.counters.get(meter);
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
      // Stamp at count time, not enqueue: a retry recounts, and a new count sent with the first attempt's time
      // would be dropped by the server as a dupe while recordReported still records it.
      const observedAt = new Date();
      const lastReported = await this.deps.usageReportCache.lastReported(reportOrgId, dimensionKey);
      if (lastReported === value) return;

      const outcome = await this.deps.licenseServer.reportSnapshot(reportOrgId, {
        dimensionKey,
        value,
        observedAt,
        source: this.source
      });
      // Final answer: don't retry, don't record.
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

  // No paid-plan check here (unlike handleUsageEvent): during an outage the plan is the slugless fallback,
  // and these events never get resent.
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
