import { TDbClient } from "@app/db";
import { poolStoreConnection, singleStoreConnection } from "@app/domains/lib/data-access";
import type { TDomainCron, TDomainQueue } from "@app/domains/lib/jobs";
import { TransactionRunner } from "@app/domains/lib/transactions";
import { logger } from "@app/lib/logger";

import { OtelMetricsClient } from "./clients/otel-metrics/client";
import { OutboxEntryStore } from "./data-access/outbox-entry-store";
import { TEventConsumer, TEventsStores } from "./services/dependencies";
import { EventDeliveryService, TEventDeliveryService } from "./services/event-delivery/service";
import { EventEmitterService, TEventEmitterService } from "./services/event-emitter/service";
import { ConsumerRegistry } from "./services/helpers/consumer-registry";
import { EventsQueues, FlushQueue } from "./services/helpers/flush-queue";
import { RelayTimer } from "./services/helpers/relay-timer";

export { MAX_OUTBOX_PAYLOAD_BYTES } from "./models/emitted-event";
export type { TEventInput } from "./models/emitted-event";
export { EventDefinition, EventModificationType } from "./models/event-definition";
export { EventOutboxStatus, EventResultStatus, MAX_OUTBOX_ATTEMPTS } from "./models/outbox-entry";
export type { TEvent, TEventConsumer, TEventConsumerResult } from "./services/dependencies";
export type { TEventDeliveryService } from "./services/event-delivery/service";
export type { TEventEmitterService, TEventEmitterTransaction } from "./services/event-emitter/service";
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
  readonly eventEmitterService: TEventEmitterService;

  readonly eventDeliveryService: TEventDeliveryService;

  private readonly consumerRegistry = new ConsumerRegistry();

  private readonly otelMetricsClient: OtelMetricsClient;

  private readonly relayTimer: RelayTimer;

  constructor(private readonly deps: TEventsDeps) {
    const { db } = deps;
    const outboxEntryStore = new OutboxEntryStore(poolStoreConnection(db));
    const transactionRunner = new TransactionRunner<TEventsStores>(db, (trx, locks) => ({
      outboxEntryStore: new OutboxEntryStore(singleStoreConnection(trx)),
      locks
    }));
    this.otelMetricsClient = new OtelMetricsClient(deps.isTelemetryEnabled);

    this.eventEmitterService = new EventEmitterService(
      outboxEntryStore,
      transactionRunner,
      this.consumerRegistry,
      this.otelMetricsClient
    );
    this.eventDeliveryService = new EventDeliveryService(
      outboxEntryStore,
      transactionRunner,
      this.consumerRegistry,
      new FlushQueue(deps.queueService),
      this.otelMetricsClient
    );
    this.relayTimer = new RelayTimer(() => this.eventDeliveryService.relayDueEvents());
  }

  // Only while wiring: throws once the module has started.
  registerConsumer(consumer: TEventConsumer): void {
    this.consumerRegistry.register(consumer);
  }

  // Call once at boot, after every consumer is registered. Emit writes nothing for an event nobody subscribes
  // to, so a late consumer would have missed events.
  start(): void {
    this.consumerRegistry.seal();

    this.deps.queueService.start(
      EventsQueues.flush,
      async (job) => {
        const { consumer } = job.data;
        try {
          await this.eventDeliveryService.drain(consumer);
        } catch (error) {
          // removeOnFail with a single attempt, so this log is the only trace the job leaves.
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
      handler: async () => this.eventDeliveryService.sweepStaleClaims()
    });

    this.deps.cronJob.register({
      name: "event-outbox-cleanup",
      pattern: CLEANUP_CRON,
      runHashTtlS: CRON_RUN_HASH_TTL_S,
      enabled: !this.deps.isSecondaryInstance,
      handler: async () => this.eventDeliveryService.pruneTerminalRows()
    });

    if (!this.deps.isGeneralWorkerRunModeEnabled || this.deps.isSecondaryInstance) return;

    this.otelMetricsClient.registerOldestPendingGauge();
    this.relayTimer.start();
  }

  // Waits for an in-flight relay tick.
  stop(): Promise<void> {
    return this.relayTimer.stop();
  }
}
