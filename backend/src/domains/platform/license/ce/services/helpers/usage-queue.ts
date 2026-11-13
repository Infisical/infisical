import { v4 as uuidv4 } from "uuid";

import { logger } from "@app/lib/logger";
import type { QueueJobs, QueueName, TQueueJobTypes, TQueueServiceFactory } from "@app/queue";

import { Meter } from "../../models/meter";
import { TLicenseServer, TUsageReportCache } from "../dependencies";
import type { TMeteringEventInput } from "../usage-metering/service";
import { MAX_USAGE_EVENTS_PER_REQUEST } from "./license-server-types";
import { CounterRegistry } from "./usage-counters";

// Names are frozen: old pods share these queues during a rolling deploy. Typed against the queue catalog without
// importing it, since the queue module is in an import cycle with crypto.
export const UsageQueues = {
  usageEvent: "usage-event" as QueueName.UsageEvent,
  usageEventJob: "usage-event-job" as QueueJobs.UsageEvent,
  meteringEvent: "metering-event" as QueueName.MeteringEvent,
  meteringEventJob: "metering-event-job" as QueueJobs.MeteringEvent
};

export type TMeteringEventPayload = TQueueJobTypes[QueueName.MeteringEvent]["payload"]["events"];

const USAGE_DEBOUNCE_MS = 5000;

// Never throws: the metered write already happened, and a lost report gets fixed by the next one or reconcile.
export class UsageQueue {
  constructor(
    private readonly queueService: Pick<TQueueServiceFactory, "queue">,
    private readonly licenseServer: TLicenseServer,
    private readonly usageReportCache: TUsageReportCache,
    private readonly counterRegistry: CounterRegistry
  ) {}

  // Debounced: replaces a pending event for the same org and dimension.
  emit(orgId: string, meter: Meter): void {
    if (!this.licenseServer.isEnabled()) return;
    const dimensionKey = meter.key;

    void this.queueService
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
    this.counterRegistry.all().forEach((counter) => this.emit(orgId, counter.meter));
  }

  // Reports only go out on metered writes, so a lost report would stay wrong until the next write. Once per
  // interval per org, the first plan read resends every meter; the worker skips unchanged ones.
  reconcile(orgId: string): void {
    if (!this.licenseServer.isEnabled()) return;

    void (async () => {
      if (await this.usageReportCache.isReconciled(orgId)) return;
      if (!(await this.usageReportCache.acquireReconcileMarker(orgId))) return;
      this.emitAll(orgId);
    })().catch((error) => {
      logger.error(error, `usage-metering: failed to reconcile org usage [orgId=${orgId}]`);
    });
  }

  // Every event must be delivered, so no debounce or replace. The server accepts or rejects a request whole,
  // so one dimension per job: an unpriced dimension gets refused without taking other events down with it.
  recordMeteringEvents(orgId: string, events: TMeteringEventInput[]): void {
    if (!this.licenseServer.isEnabled() || !events.length) return;

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
      void this.queueService
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
