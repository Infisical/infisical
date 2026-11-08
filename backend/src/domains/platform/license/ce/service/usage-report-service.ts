import { logger } from "@app/lib/logger";

import { UsageReportMemory } from "../data-access/usage-report-memory";
import { SELF_HOSTED_LICENSE_ORG_ID, TLicenseServerClient } from "../license-server-client/license-server-client";
import { TUsageEvent, UsageReportError } from "../license-server-client/usage-reports";
import { CounterRegistry } from "./counter-registry";
import { InstanceEntitlementsHolder } from "./instance-entitlements-holder";
import { OrganizationDirectory } from "./organization-directory";
import { PlanResolver } from "./plan-resolver";
import { TMeteringEventPayload, UsageQueue } from "./usage-queue";

export type TUsageReportServiceDeps = {
  instance: InstanceEntitlementsHolder;
  counters: CounterRegistry;
  organizations: OrganizationDirectory;
  usageReportMemory: UsageReportMemory;
  planResolver: PlanResolver;
  usageQueue: UsageQueue;
  licenseServerClient: TLicenseServerClient;
};

// The usage workers: count a meter and send it to the License Server.
export class UsageReportService {
  constructor(private readonly deps: TUsageReportServiceDeps) {}

  private get source() {
    return this.deps.instance.isCloud() ? "cloud" : "self-hosted";
  }

  // Counts the meter and reports it only when the value changed since the last report.
  async handleUsageEvent(orgId: string, dimensionKey: string, observedAt: Date): Promise<void> {
    const client = this.deps.licenseServerClient;
    if (!client.canReportUsage()) return;

    const cloud = this.deps.instance.isCloud();
    // On cloud an org with no paid plan (null slug) has no license on the server, so a report would only 404.
    if (cloud && !(await this.deps.planResolver.resolve(orgId)).isPaid) return;

    const counter = this.deps.counters.get(dimensionKey);
    if (!counter) {
      logger.warn(`usage-metering: unknown metered feature, dropping event [dimensionKey=${dimensionKey}]`);
      return;
    }

    let reportOrgId = SELF_HOSTED_LICENSE_ORG_ID;
    if (cloud) {
      reportOrgId = counter.meter.scope === "org-tree" ? await this.deps.organizations.rootOrgIdOf(orgId) : orgId;
    }

    try {
      const value = await counter.count(cloud ? reportOrgId : null);
      const lastReported = await this.deps.usageReportMemory.lastReported(reportOrgId, dimensionKey);
      if (lastReported === value) return;

      try {
        await client.reportSnapshots(reportOrgId, [
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
      await this.deps.usageReportMemory.recordReported(reportOrgId, dimensionKey, value);
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
    const client = this.deps.licenseServerClient;
    if (!client.canReportUsage() || !events.length) return;

    const reportOrgId = this.deps.instance.isCloud() ? orgId : SELF_HOSTED_LICENSE_ORG_ID;
    const payload: TUsageEvent[] = events.map((e) => ({
      event_id: e.eventId,
      dimension_key: e.dimensionKey,
      quantity: e.quantity,
      occurred_at: e.occurredAt,
      source: this.source
    }));

    try {
      const results = await client.reportEvents(reportOrgId, payload);
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
    if (!this.deps.licenseServerClient.canReportUsage()) return;
    this.deps.usageQueue.emitAll(SELF_HOSTED_LICENSE_ORG_ID);
  }
}
