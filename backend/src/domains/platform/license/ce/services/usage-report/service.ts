import { TOrganizationsProjectsService } from "@app/domains/platform/organizations-projects/ce/module";
import { logger } from "@app/lib/logger";

import { Meter } from "../../models/meter";
import { TLicenseServer, TUsageReportCache, TUsageSource } from "../dependencies";
import { SELF_HOSTED_LICENSE_ORG_ID } from "../helpers/license-server-types";
import { CounterRegistry } from "../helpers/usage-counters";
import { TMeteringEventPayload, UsageQueue } from "../helpers/usage-queue";
import { TLicenseService } from "../license/service";

export type TUsageReportService = {
  handleUsageEvent(orgId: string, dimensionKey: string): Promise<void>;
  handleMeteringEvents(orgId: string, events: TMeteringEventPayload): Promise<void>;
  flushInstanceUsage(): void;
};

// Only LicenseModule.start() registers these.
export class UsageReportService implements TUsageReportService {
  constructor(
    private readonly counterRegistry: CounterRegistry,
    private readonly usageReportCache: TUsageReportCache,
    private readonly usageQueue: UsageQueue,
    private readonly licenseService: TLicenseService,
    private readonly licenseServer: TLicenseServer,
    private readonly organizationsProjectsService: TOrganizationsProjectsService
  ) {}

  // Skips unpaid cloud orgs: they have no license on the server, so a report would 404. observedAt is stamped at
  // count time, not enqueue: a retry recounts, and a new count sent with the old time would be dropped as a dupe
  // while recordReported still records it. A no-license or not-priced outcome is final: no retry, no record.
  async handleUsageEvent(orgId: string, dimensionKey: string): Promise<void> {
    if (!this.licenseServer.canReportUsage()) return;

    const cloud = this.isCloud();
    if (cloud && !(await this.licenseService.getPlan(orgId)).isPaid) return;

    const meter = Meter.fromKey(dimensionKey);
    const counter = meter && this.counterRegistry.get(meter);
    if (!counter) {
      logger.warn(`usage-metering: unknown metered feature, dropping event [dimensionKey=${dimensionKey}]`);
      return;
    }

    let reportOrgId = SELF_HOSTED_LICENSE_ORG_ID;
    if (cloud) {
      reportOrgId =
        counter.meter.scope === "org-tree" ? await this.organizationsProjectsService.resolveRootOrgId(orgId) : orgId;
    }

    try {
      const value = await counter.count(cloud ? reportOrgId : null);
      const observedAt = new Date();
      const lastReported = await this.usageReportCache.lastReported(reportOrgId, dimensionKey);
      if (lastReported === value) return;

      const outcome = await this.licenseServer.reportSnapshot(reportOrgId, {
        dimensionKey,
        value,
        observedAt,
        source: this.source
      });
      if (outcome !== "reported") {
        logger.info(
          `usage-event-queue: ${outcome === "no-license" ? "license not found" : "dimension not priced on this license"}, skipping [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}]`
        );
        return;
      }

      logger.info(
        `usage-event-queue: reported usage event [orgId=${reportOrgId}] [dimensionKey=${dimensionKey}] [value=${value}]`
      );
      await this.usageReportCache.recordReported(reportOrgId, dimensionKey, value);
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
    if (!this.licenseServer.canReportUsage() || !events.length) return;

    const reportOrgId = this.isCloud() ? orgId : SELF_HOSTED_LICENSE_ORG_ID;

    try {
      const outcome = await this.licenseServer.reportEvents(reportOrgId, events, this.source);
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

  // Self-hosted daily backstop on top of event-driven reports. Emits each meter once for the whole instance; the
  // worker skips unchanged ones.
  flushInstanceUsage(): void {
    if (!this.licenseServer.canReportUsage()) return;
    this.usageQueue.emitAll(SELF_HOSTED_LICENSE_ORG_ID);
  }

  private isCloud() {
    return this.licenseService.getInstanceEntitlements().isCloud();
  }

  private get source(): TUsageSource {
    return this.isCloud() ? "cloud" : "self-hosted";
  }
}
