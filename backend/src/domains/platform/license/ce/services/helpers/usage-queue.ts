import { v4 as uuidv4 } from "uuid";

import { logger } from "@app/lib/logger";
import type { QueueJobs, QueueName, TQueueJobTypes, TQueueServiceFactory } from "@app/queue";

import { Meter } from "../../model/meter";
import { TLicenseServer, TUsageReportCache } from "../dependencies";
import { CounterRegistry } from "./counter-registry";
import { MAX_USAGE_EVENTS_PER_REQUEST } from "./license-server-types";

// Same names as the old pods so their queued jobs still run. Typed against the queue catalog without importing
// it, since the queue module is in an import cycle with crypto.
export const UsageQueues = {
  usageEvent: "usage-event" as QueueName.UsageEvent,
  usageEventJob: "usage-event-job" as QueueJobs.UsageEvent,
  meteringEvent: "metering-event" as QueueName.MeteringEvent,
  meteringEventJob: "metering-event-job" as QueueJobs.MeteringEvent
};

// A metered fact for a sum or count meter. The license server dedups on (eventId, occurredAt), so both
// must be stable for the fact: recording it again with the same pair is a no-op. quantity is required
// because the server reads a missing one as 0; a count meter ignores it, so pass 1.
export type TMeteringEventInput = {
  eventId: string;
  meter: Meter;
  quantity: number;
  occurredAt: Date;
};

export type TMeteringEventPayload = TQueueJobTypes[QueueName.MeteringEvent]["payload"]["events"];

export type TUsageQueueDeps = {
  queueService: Pick<TQueueServiceFactory, "queue">;
  licenseServer: TLicenseServer;
  usageReportCache: TUsageReportCache;
  counters: CounterRegistry;
};

const USAGE_DEBOUNCE_MS = 5000;

// Never throws: the metered write already happened, and a lost report gets fixed by the next one or reconcile.
export class UsageQueue {
  constructor(private readonly deps: TUsageQueueDeps) {}

  // Debounced: replaces a pending event for the same org and dimension.
  emit(orgId: string, meter: Meter): void {
    if (!this.deps.licenseServer.isEnabled()) return;
    const dimensionKey = meter.key;

    void this.deps.queueService
      .queue(
        UsageQueues.usageEvent,
        UsageQueues.usageEventJob,
        { orgId, dimensionKey },
        {
          delay: USAGE_DEBOUNCE_MS,
          attempts: 5,
          backoff: { type: "exponential", delay: 10_000 },
          removeOnComplete: true,
          removeOnFail: true,
          deduplication: {
            id: `usage-event-${orgId}-${dimensionKey}`,
            keepLastIfActive: true,
            replace: true
          }
        }
      )
      .catch((error) => {
        logger.error(
          error,
          `usage-metering: failed to enqueue usage event [orgId=${orgId}] [dimensionKey=${dimensionKey}]`
        );
      });
  }

  emitAll(orgId: string): void {
    this.deps.counters.all().forEach((counter) => this.emit(orgId, counter.meter));
  }

  // Reports only go out on metered writes, so a lost report (or an expired last-reported value) would stay
  // wrong until the next write. Once per interval per org, the first plan read resends every meter; the
  // worker skips the ones that didn't change.
  reconcile(orgId: string): void {
    if (!this.deps.licenseServer.isEnabled()) return;

    void (async () => {
      if (!(await this.deps.usageReportCache.acquireReconcileMarker(orgId))) return;
      this.emitAll(orgId);
    })().catch((error) => {
      logger.error(error, `usage-metering: failed to reconcile org usage [orgId=${orgId}]`);
    });
  }

  // Every event must be delivered, so no debounce or replace. The server accepts or rejects a request whole,
  // so one dimension per job: an unpriced dimension gets refused without taking other events down with it.
  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void {
    if (!this.deps.licenseServer.isEnabled() || !events.length) return;

    const byDimension = new Map<string, TMeteringEventPayload>();
    events.forEach((e) => {
      const group = byDimension.get(e.meter.key) ?? [];
      group.push({
        eventId: e.eventId,
        dimensionKey: e.meter.key,
        quantity: e.quantity,
        occurredAt: e.occurredAt.toISOString()
      });
      byDimension.set(e.meter.key, group);
    });

    const chunks = [...byDimension.values()].flatMap((group) => {
      const parts: TMeteringEventPayload[] = [];
      for (let i = 0; i < group.length; i += MAX_USAGE_EVENTS_PER_REQUEST) {
        parts.push(group.slice(i, i + MAX_USAGE_EVENTS_PER_REQUEST));
      }
      return parts;
    });

    chunks.forEach((chunk) => {
      void this.deps.queueService
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
}
