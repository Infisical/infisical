import { v4 as uuidv4 } from "uuid";

import { logger } from "@app/lib/logger";
import type { QueueJobs, QueueName, TQueueJobTypes, TQueueServiceFactory } from "@app/queue";

import { CounterRegistry } from "./counter-registry";
import { TLicenseServer, TUsageReportCache } from "./dependencies";
import { MAX_USAGE_EVENTS_PER_REQUEST } from "./license-server-types/usage-reports";

// Names match the old pods' so jobs they queued still run. Typed against the queue catalog without importing
// it since the queue module is in an import cycle with crypto.
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
  dimensionKey: string;
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

// Never throws into the caller: the metered write already happened, and a lost report gets fixed by the
// next one or by reconcile.
export class UsageQueue {
  constructor(private readonly deps: TUsageQueueDeps) {}

  // Queued after a short debounce, replacing an event for the same org and dimension that has not run yet.
  emit(orgId: string, dimensionKey: string): void {
    if (!this.deps.licenseServer.isEnabled()) return;

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
    this.deps.counters.all().forEach((counter) => this.emit(orgId, counter.meter.key));
  }

  // Reports are sent only when a metered write happens, and the last reported value is remembered for
  // seven days. A report lost to a failed job, or a meter whose last reported value expired, would stay wrong until the
  // next write to it. So once per interval per org, the first plan read re-sends every meter; the worker
  // skips the ones whose value the server already has.
  reconcile(orgId: string): void {
    if (!this.deps.licenseServer.isEnabled()) return;

    void (async () => {
      if (!(await this.deps.usageReportCache.acquireReconcileMarker(orgId))) return;
      this.emitAll(orgId);
    })().catch((error) => {
      logger.error(error, `usage-metering: failed to reconcile org usage [orgId=${orgId}]`);
    });
  }

  // Every event is a fact to deliver, so jobs are never debounced or replaced. The server accepts or rejects
  // a request whole, so each job holds one dimension: a dimension the plan does not price is refused without
  // taking other events with it.
  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void {
    if (!this.deps.licenseServer.isEnabled() || !events.length) return;

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
