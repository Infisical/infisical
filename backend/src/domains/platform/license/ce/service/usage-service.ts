import { v4 as uuidv4 } from "uuid";

import { BadRequestError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import type { QueueName, TQueueJobTypes } from "@app/queue";

import { TOrgSeatUsage } from "../model/license-types";
import { IdentitiesMeter, UserIdentities } from "../model/metered-features";
import { UsageQueues } from "../model/usage-queues";
import { MAX_USAGE_EVENTS_PER_REQUEST, TUsageEvent, UsageReportError } from "../model/usage-report";
import {
  emitUsage,
  isCloud,
  resolvePlan,
  rootOrgOf,
  SELF_HOSTED_LICENSE_ORG_ID,
  TLicenseContext
} from "./license-context";

// A metered fact for a sum or count meter. The license server dedups on (eventId, occurredAt), so both
// must be stable for the fact: recording it again with the same pair is a no-op. quantity is required
// because the server reads a missing one as 0; a count meter ignores it, so pass 1.
export type TMeteringEventInput = {
  eventId: string;
  dimensionKey: string;
  quantity: number;
  occurredAt: Date;
};

type TMeteringEventPayload = TQueueJobTypes[QueueName.MeteringEvent]["payload"]["events"];

export class UsageService {
  constructor(private readonly ctx: TLicenseContext) {}

  private get source() {
    return isCloud(this.ctx) ? "cloud" : "self-hosted";
  }

  // Fire-and-forget after a metered create or delete. Never throws into the request path.
  emit(orgId: string, dimensionKey: string): void {
    emitUsage(this.ctx, orgId, dimensionKey);
  }

  // Every event is a fact to deliver, so jobs are never debounced or replaced. The server accepts or rejects
  // a request whole, so each job holds one dimension: a dimension the plan does not price is refused without
  // taking other events with it.
  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void {
    if (!this.ctx.hooks.isMeteringEnabled() || !events.length) return;

    const byDimension = new Map<string, TMeteringEventPayload>();
    events.forEach((e) => {
      const group = byDimension.get(e.dimensionKey) ?? [];
      group.push({
        eventId: e.eventId,
        dimensionKey: e.dimensionKey,
        quantity: e.quantity,
        occurredAt: e.occurredAt.toISOString()
      });
      byDimension.set(e.dimensionKey, group);
    });

    const chunks = [...byDimension.values()].flatMap((group) => {
      const parts: TMeteringEventPayload[] = [];
      for (let i = 0; i < group.length; i += MAX_USAGE_EVENTS_PER_REQUEST) {
        parts.push(group.slice(i, i + MAX_USAGE_EVENTS_PER_REQUEST));
      }
      return parts;
    });

    chunks.forEach((chunk) => {
      void this.ctx.queueService
        .queue(
          UsageQueues.meteringEvent,
          UsageQueues.meteringEventJob,
          { orgId, events: chunk },
          {
            jobId: uuidv4(),
            attempts: 10,
            backoff: { type: "exponential", delay: 10_000 },
            removeOnComplete: true,
            removeOnFail: { count: 1000 }
          }
        )
        .catch((error) => {
          logger.error(
            error,
            `usage-metering: failed to enqueue metering events [orgId=${orgId}] [dimensionKey=${chunk[0].dimensionKey}] [count=${chunk.length}]`
          );
        });
    });
  }

  async countUsage(orgId: string, dimensionKey: string): Promise<number | null> {
    const counter = this.ctx.state.counters.get(dimensionKey);
    if (!counter) return null;
    return counter.count(isCloud(this.ctx) ? orgId : null, this.ctx.tx);
  }

  // Seats in use: org members, and members plus machine identities. On cloud the root org's whole tree;
  // self-hosted, the whole instance.
  async getSeatUsage(orgId: string): Promise<TOrgSeatUsage> {
    let scope: string | null = null;
    if (isCloud(this.ctx)) {
      const root = await rootOrgOf(this.ctx, orgId);
      if (!root) throw new NotFoundError({ message: `Organization with ID '${orgId}' not found` });
      scope = root.id;
    }
    const members = this.ctx.state.counters.get(UserIdentities.key);
    const identities = this.ctx.state.counters.get(IdentitiesMeter.key);
    const [membersUsed, identitiesUsed] = await Promise.all([
      members ? members.count(scope, this.ctx.tx) : 0,
      identities ? identities.count(scope, this.ctx.tx) : 0
    ]);
    return { membersUsed, identitiesUsed };
  }

  // Refuses a new member once the plan's cap is reached. via names the provisioning method in the message.
  async assertSeatAvailable({
    orgId,
    identityLimit,
    via
  }: {
    orgId: string;
    identityLimit: number | null;
    via?: string;
  }): Promise<void> {
    if (!identityLimit) return;
    const { identitiesUsed } = await this.getSeatUsage(orgId);
    if (identitiesUsed >= identityLimit) {
      throw new BadRequestError({
        message: `Failed to create new member${via ? ` via ${via.toUpperCase()}` : ""} due to member limit reached. Upgrade plan to add more members.`
      });
    }
  }

  // Counts the meter and reports it only when the value changed since the last report.
  async handleUsageEvent(orgId: string, dimensionKey: string, observedAt: Date): Promise<void> {
    const reporter = this.ctx.hooks.usageReporter;
    if (!reporter) return;

    const cloud = isCloud(this.ctx);
    // On cloud an org with no paid plan (null slug) has no license on the server, so a report would only 404.
    if (cloud && !(await resolvePlan(this.ctx, orgId)).slug) return;

    const counter = this.ctx.state.counters.get(dimensionKey);
    if (!counter) {
      logger.warn(`usage-metering: unknown metered feature, dropping event [dimensionKey=${dimensionKey}]`);
      return;
    }

    let reportOrgId = SELF_HOSTED_LICENSE_ORG_ID;
    if (cloud) {
      reportOrgId = counter.scope === "org-tree" ? ((await rootOrgOf(this.ctx, orgId))?.id ?? orgId) : orgId;
    }

    try {
      const value = await counter.count(cloud ? reportOrgId : null);
      const lastReported = await this.ctx.state.planCache.lastReported(reportOrgId, dimensionKey);
      if (lastReported === value) return;

      try {
        await reporter.reportSnapshots(reportOrgId, [
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
      await this.ctx.state.planCache.recordReported(reportOrgId, dimensionKey, value);
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
    const reporter = this.ctx.hooks.usageReporter;
    if (!reporter || !events.length) return;

    const reportOrgId = isCloud(this.ctx) ? orgId : SELF_HOSTED_LICENSE_ORG_ID;
    const payload: TUsageEvent[] = events.map((e) => ({
      event_id: e.eventId,
      dimension_key: e.dimensionKey,
      quantity: e.quantity,
      occurred_at: e.occurredAt,
      source: this.source
    }));

    try {
      const results = await reporter.reportEvents(reportOrgId, payload);
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
    if (!this.ctx.hooks.usageReporter) return;
    this.ctx.state.counters
      .all()
      .forEach((counter) => emitUsage(this.ctx, SELF_HOSTED_LICENSE_ORG_ID, counter.feature.key));
  }
}
