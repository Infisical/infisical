import { TDbClient } from "@app/db";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import type { TDomainCron, TDomainQueue } from "@app/domains/lib/jobs";
import { TransactionRunner } from "@app/domains/lib/transactions";
import { logger } from "@app/lib/logger";
import { resolveCoreMeter } from "@app/lib/telemetry/metrics";

import { OutboxEntryStore } from "./data-access/outbox-entry-store";
import { TEventsStores } from "./services/dependencies";
import { EventsService, TEventsService } from "./services/events/service";
import { ConsumerRegistry } from "./services/helpers/consumer-registry";
import { EventsQueues, FlushQueue } from "./services/helpers/flush-queue";
import { RelayTimer } from "./services/helpers/relay-timer";

export { MAX_OUTBOX_PAYLOAD_BYTES } from "./models/emitted-event";
export type { TEventInput } from "./models/emitted-event";
export { EventDefinition, EventModificationType } from "./models/event-definition";
export { EventOutboxStatus, EventResultStatus, MAX_OUTBOX_ATTEMPTS } from "./models/outbox-entry";
export type { IEventConsumer, TEvent, TEventConsumerResult } from "./services/dependencies";
export type { TEventsTransaction } from "./services/events/events-transaction";
export type { TEventsService } from "./services/events/service";
export { parseEventPayload, runEventsConcurrentlyByKey, runEventsSerially } from "./services/helpers/consume-events";

const FLUSH_WORKER_CONCURRENCY = 10;

const STALE_CLAIM_SWEEPER_CRON = "*/5 * * * *";
const CLEANUP_CRON = "*/15 * * * *";
const CRON_RUN_HASH_TTL_S = 60 * 60;

export type TEventsDeps = {
  db: TDbClient;
  queueService: TDomainQueue;
  cronJob: TDomainCron;
  isSecondaryInstance: boolean;
  isGeneralWorkerRunModeEnabled: boolean;
  isTelemetryEnabled: boolean;
};

export class EventsModule {
  readonly eventsService: TEventsService;

  private readonly service: EventsService;

  private readonly consumerRegistry = new ConsumerRegistry();

  private readonly relayTimer: RelayTimer;

  constructor(private readonly deps: TEventsDeps) {
    const { db } = deps;
    this.service = new EventsService(
      new OutboxEntryStore(poolStoreConnection(db)),
      new TransactionRunner<TEventsStores>(db, (trx, locks) => ({
        outboxEntryStore: new OutboxEntryStore(singleStoreConnection(trx)),
        locks
      })),
      this.consumerRegistry,
      new FlushQueue(deps.queueService),
      deps.isTelemetryEnabled
    );
    this.eventsService = this.service;
    this.relayTimer = new RelayTimer(() => this.service.relayDueEvents());
  }

  // Call once at boot, after every consumer is registered: nothing is written for an event no consumer
  // subscribes to, so a consumer registered later would have missed events.
  start(): void {
    this.consumerRegistry.seal();

    this.deps.queueService.start(
      EventsQueues.flush,
      async (job) => {
        const { consumer } = job.data;
        try {
          await this.service.drain(consumer);
        } catch (error) {
          // The job is removeOnFail with a single attempt, so this line is the only trace it leaves.
          logger.error(error, `event-outbox: flush worker crashed [consumer=${consumer}]`);
          throw error;
        }
      },
      { concurrency: FLUSH_WORKER_CONCURRENCY }
    );

    this.deps.cronJob.register({
      name: "event-outbox-stale-claim-sweeper",
      pattern: STALE_CLAIM_SWEEPER_CRON,
      runHashTtlS: CRON_RUN_HASH_TTL_S,
      enabled: !this.deps.isSecondaryInstance,
      handler: async () => this.service.sweepStaleClaims()
    });

    this.deps.cronJob.register({
      name: "event-outbox-cleanup",
      pattern: CLEANUP_CRON,
      runHashTtlS: CRON_RUN_HASH_TTL_S,
      enabled: !this.deps.isSecondaryInstance,
      handler: async () => this.service.pruneTerminalRows()
    });

    if (!this.deps.isGeneralWorkerRunModeEnabled || this.deps.isSecondaryInstance) return;

    this.registerGauges();
    this.relayTimer.start();
  }

  // Waits for a relay tick that is still running.
  stop(): Promise<void> {
    return this.relayTimer.stop();
  }

  private registerGauges(): void {
    const oldestPendingGauge = resolveCoreMeter().createObservableGauge("infisical.event_outbox.oldest_pending_age", {
      description:
        "Age in seconds of the oldest undelivered outbox event, by consumer. Alarm when this exceeds a small multiple of the relay interval: it means events are being recorded but not delivered.",
      unit: "s"
    });
    oldestPendingGauge.addCallback((result) => {
      if (!this.deps.isTelemetryEnabled) return;
      this.service.oldestPendingAges().forEach(({ consumer, ageSeconds }) => {
        result.observe(ageSeconds, { "event_outbox.consumer": consumer });
      });
    });
  }
}
