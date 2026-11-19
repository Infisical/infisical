import { TTransaction, TTransactionRunner } from "@app/domains/lib/transactions";
import { logger } from "@app/lib/logger";
import { recordEventOutboxExhaustedMetric, recordEventOutboxLagMetric } from "@app/lib/telemetry/metrics";

import { TEventInput } from "../../models/emitted-event";
import { EventDefinition } from "../../models/event-definition";
import { EventOutboxStatus, EventResultStatus, OutboxEntry } from "../../models/outbox-entry";
import { RetryBackoff } from "../../models/retry-backoff";
import { IEventConsumer, TEvent, TEventConsumerResult, TEventsStores, TOutboxEntryStore } from "../dependencies";
import { buildDeliveries } from "../helpers/build-deliveries";
import { ConsumerRegistry } from "../helpers/consumer-registry";
import { FlushQueue } from "../helpers/flush-queue";
import { TimeoutError, withTimeout } from "../helpers/with-timeout";
import { EventsTransaction, TEventsTransaction } from "./events-transaction";

export const MAX_BATCHES_PER_FLUSH = 10;
export const OUTBOX_CLAIM_BATCH_SIZE = 100;

export const STALE_CLAIM_THRESHOLD_MS = 10 * 60_000;

export const DELIVERED_RETENTION_MS = 24 * 60 * 60_000;
export const FAILED_RETENTION_MS = 30 * 24 * 60 * 60_000;

const PRUNE_BATCH_SIZE = 5_000;
const PRUNE_MAX_BATCHES = 20;

const STALE_SWEEP_BATCH_SIZE = 1_000;
const STALE_SWEEP_MAX_BATCHES = 10;

// A quarter of the threshold so one missed beat doesn't get a live claim swept.
const CLAIM_HEARTBEAT_INTERVAL_MS = STALE_CLAIM_THRESHOLD_MS / 4;

// Deliberately longer than the stale threshold: the heartbeat exists so a legitimately slow batch can
// outlive it. This is the backstop for a handle() that never settles, which would otherwise keep the
// heartbeat, and with it the per-consumer flush job, alive until the process restarts. It cannot
// cancel the work in flight, so an abandoned batch may still deliver and be delivered again on retry.
const CONSUMER_HANDLE_TIMEOUT_MS = 3 * STALE_CLAIM_THRESHOLD_MS;

const COMMIT_ATTEMPTS = 3;
const COMMIT_RETRY_DELAY_MS = 250;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });

const toEvent = (entry: OutboxEntry): TEvent => ({
  specversion: "1.0",
  id: entry.eventId,
  source: EventDefinition.sourceOf(entry.eventType),
  type: entry.eventType,
  time: entry.occurredAt.toISOString(),
  data: entry.payload,
  isFinalAttempt: entry.isFinalAttempt()
});

export type TEventsService = {
  // Writes the events on their own. To make one exactly as durable as a write, emit it through within(tx).
  emit(events: TEventInput[]): Promise<void>;
  // Joins the caller's transaction, so the events commit or roll back with it.
  within(tx: TTransaction): TEventsTransaction;
  // Only while wiring: it throws once the module has started.
  registerConsumer(consumer: IEventConsumer): void;
  // Delivers a consumer's due events now, in bounded batches.
  drain(consumer: string): Promise<{ handled: number; unknownConsumer: boolean }>;
};

export class EventsService implements TEventsService {
  private oldestPending: { consumer: string; ageSeconds: number }[] = [];

  constructor(
    private readonly outboxEntryStore: TOutboxEntryStore,
    private readonly transactionRunner: TTransactionRunner<TEventsStores>,
    private readonly consumerRegistry: ConsumerRegistry,
    private readonly flushQueue: FlushQueue,
    private readonly isTelemetryEnabled: boolean
  ) {}

  async emit(events: TEventInput[]): Promise<void> {
    const deliveries = buildDeliveries(this.consumerRegistry, events);
    if (deliveries.length === 0) return;

    await this.outboxEntryStore.insert(deliveries);
  }

  within(tx: TTransaction): TEventsTransaction {
    return new EventsTransaction(this.transactionRunner.within(tx), this.consumerRegistry);
  }

  registerConsumer(consumer: IEventConsumer): void {
    this.consumerRegistry.register(consumer);
  }

  // Discovery only sees consumers registered in this process; rows for other names wait.
  async relayDueEvents(): Promise<void> {
    const consumers = await this.outboxEntryStore.findDueConsumers(this.consumerRegistry.names());

    if (consumers.length > 0) {
      await Promise.all(consumers.map((consumer) => this.flushQueue.enqueue(consumer)));
    }

    if (this.isTelemetryEnabled) {
      this.oldestPending = await this.outboxEntryStore.findOldestPendingAgeSeconds();
    }
  }

  // As of the last relay tick.
  oldestPendingAges(): { consumer: string; ageSeconds: number }[] {
    return this.oldestPending;
  }

  // Bounded so a deep backlog can't hold a worker forever; the relay's next tick picks up the rest.
  async drain(consumerName: string): Promise<{ handled: number; unknownConsumer: boolean }> {
    const consumer = this.consumerRegistry.get(consumerName);
    if (!consumer) {
      logger.error(`event-outbox: no consumer registered under '${consumerName}'; leaving its events untouched`);
      return { handled: 0, unknownConsumer: true };
    }

    let handled = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_FLUSH; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- batches are serial on purpose, to stay paced
      const { lockToken, entries } = await this.outboxEntryStore.claimBatch(consumerName, OUTBOX_CLAIM_BATCH_SIZE);
      if (entries.length === 0) break;

      // eslint-disable-next-line no-await-in-loop -- see above
      const results = await this.handleClaimed(consumer, entries, lockToken);
      // eslint-disable-next-line no-await-in-loop -- see above
      await this.settle(consumerName, entries, lockToken, results);
      handled += entries.length;
    }

    return { handled, unknownConsumer: false };
  }

  async sweepStaleClaims(): Promise<void> {
    let retried = 0;
    const failedByConsumer = new Map<string, number>();

    for (let batch = 0; batch < STALE_SWEEP_MAX_BATCHES; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- batches must run serially to stay paced
      const expired = await this.transactionRunner.run(async ({ stores }) => {
        const stale = await stores.outboxEntryStore.lockStaleClaims({
          thresholdMs: STALE_CLAIM_THRESHOLD_MS,
          limit: STALE_SWEEP_BATCH_SIZE
        });
        if (stale.length === 0) return stale;

        const backoff = RetryBackoff.forBatch();
        stale.forEach((entry) => entry.expireClaim(backoff));
        await stores.outboxEntryStore.saveExpired(stale);
        return stale;
      });

      for (const entry of expired) {
        if (entry.status === EventOutboxStatus.Failed) {
          failedByConsumer.set(entry.consumer, (failedByConsumer.get(entry.consumer) ?? 0) + 1);
        } else {
          retried += 1;
        }
      }
      if (expired.length < STALE_SWEEP_BATCH_SIZE) break;
    }

    for (const [consumer, count] of failedByConsumer) {
      recordEventOutboxExhaustedMetric({ consumer, count });
      logger.error(
        `event-outbox: gave up on ${count} event(s) whose worker never reported back [consumer=${consumer}] [thresholdMs=${STALE_CLAIM_THRESHOLD_MS}]`
      );
    }

    const failed = [...failedByConsumer.values()].reduce((sum, count) => sum + count, 0);
    if (retried > 0 || failed > 0) {
      logger.warn(
        `event-outbox: recovered stale claims [retried=${retried}] [failed=${failed}] [thresholdMs=${STALE_CLAIM_THRESHOLD_MS}]`
      );
    }
  }

  async pruneTerminalRows(): Promise<void> {
    const now = Date.now();
    let deleted = 0;

    for (let batch = 0; batch < PRUNE_MAX_BATCHES; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- batches must run serially to stay paced
      const removed = await this.outboxEntryStore.deleteTerminalOlderThan({
        deliveredBefore: new Date(now - DELIVERED_RETENTION_MS),
        failedBefore: new Date(now - FAILED_RETENTION_MS),
        batchSize: PRUNE_BATCH_SIZE
      });
      deleted += removed;
      if (removed < PRUNE_BATCH_SIZE) break;
    }

    if (deleted > 0) {
      logger.info(`event-outbox: pruned terminal rows [deleted=${deleted}]`);
    }
  }

  // The heartbeat lets a slow batch outlive STALE_CLAIM_THRESHOLD_MS without being delivered twice.
  private async handleClaimed(
    consumer: IEventConsumer,
    entries: OutboxEntry[],
    lockToken: string
  ): Promise<TEventConsumerResult[]> {
    const ids = entries.map((entry) => entry.id);
    const heartbeat = setInterval(() => {
      this.outboxEntryStore.extendClaims(ids, lockToken).catch((error) => {
        logger.warn(error, `event-outbox: failed to extend a claim [consumer=${consumer.name}]`);
      });
    }, CLAIM_HEARTBEAT_INTERVAL_MS);

    try {
      return await withTimeout(
        consumer.handle(entries.map(toEvent)),
        CONSUMER_HANDLE_TIMEOUT_MS,
        `Consumer '${consumer.name}' did not finish handling the batch within ${CONSUMER_HANDLE_TIMEOUT_MS / 1000}s`
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (error instanceof TimeoutError) {
        logger.error(
          `event-outbox: consumer '${consumer.name}' timed out on a batch of ${entries.length}; retrying it later [timeoutMs=${CONSUMER_HANDLE_TIMEOUT_MS}]`
        );
      } else {
        logger.error(error, `event-outbox: consumer '${consumer.name}' threw while handling a batch`);
      }
      return entries.map((entry) => ({
        id: entry.eventId,
        status: EventResultStatus.Retry,
        error: message
      }));
    } finally {
      clearInterval(heartbeat);
    }
  }

  private async settle(
    consumer: string,
    entries: OutboxEntry[],
    lockToken: string,
    results: TEventConsumerResult[]
  ): Promise<void> {
    const byEventId = new Map(results.map((result) => [result.id, result]));
    const backoff = RetryBackoff.forBatch();
    const now = Date.now();

    for (const entry of entries) {
      entry.settle(byEventId.get(entry.eventId), backoff);
      recordEventOutboxLagMetric({
        consumer: entry.consumer,
        status: entry.status,
        seconds: (now - entry.occurredAt.getTime()) / 1000
      });
    }

    const settled = await this.saveSettledWithRetry(consumer, entries, lockToken);
    if (settled < entries.length) {
      logger.warn(
        `event-outbox: settled ${settled} of ${entries.length} row(s); the rest were no longer held by this claim [consumer=${consumer}]`
      );
    }

    const failed = entries.filter((entry) => entry.status === EventOutboxStatus.Failed);
    if (failed.length > 0) {
      recordEventOutboxExhaustedMetric({ consumer, count: failed.length });
      const reasons = [...new Set(failed.map((entry) => entry.lastError ?? "unknown"))].join(" | ");
      logger.error(`event-outbox: gave up on ${failed.length} event(s) [consumer=${consumer}]: ${reasons}`);
    }
  }

  // The consumer already delivered by now, so a transient failure here is retried rather than left to the
  // sweeper, which would deliver the batch again.
  private async saveSettledWithRetry(consumer: string, entries: OutboxEntry[], lockToken: string): Promise<number> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop -- retrying the same statement is the point
        return await this.transactionRunner.run(({ stores }) =>
          stores.outboxEntryStore.saveSettled(entries, lockToken)
        );
      } catch (error) {
        if (attempt >= COMMIT_ATTEMPTS) throw error;
        logger.warn(
          error,
          `event-outbox: failed to commit results, retrying [attempt=${attempt}] [consumer=${consumer}]`
        );
        // eslint-disable-next-line no-await-in-loop -- see above
        await sleep(COMMIT_RETRY_DELAY_MS * attempt);
      }
    }
  }
}
