import { TTransactionRunner } from "@app/domains/lib/transactions";
import { delay } from "@app/lib/delay";
import { groupBy } from "@app/lib/fn";
import { logger } from "@app/lib/logger";

import { EventDefinition } from "../../models/event-definition";
import { OutboxClaim } from "../../models/outbox-claim";
import { EventOutboxStatus, EventResultStatus, OutboxEntry } from "../../models/outbox-entry";
import {
  TEvent,
  TEventConsumer,
  TEventConsumerResult,
  TEventsMetrics,
  TEventsStores,
  TOutboxEntryStore
} from "../dependencies";
import { ConsumerRegistry } from "../helpers/consumer-registry";
import { FlushQueue } from "../helpers/flush-queue";
import { TimeoutError, withTimeout } from "../helpers/with-timeout";

const MAX_BATCHES_PER_FLUSH = 10;
const OUTBOX_CLAIM_BATCH_SIZE = 100;

const STALE_CLAIM_THRESHOLD_MS = 10 * 60_000;

const DELIVERED_RETENTION_MS = 24 * 60 * 60_000;
const FAILED_RETENTION_MS = 30 * 24 * 60 * 60_000;

const PRUNE_BATCH_SIZE = 5_000;
const PRUNE_MAX_BATCHES = 20;

const STALE_SWEEP_BATCH_SIZE = 1_000;
const STALE_SWEEP_MAX_BATCHES = 10;

// A quarter of the threshold so one missed beat doesn't get a live claim swept.
const CLAIM_HEARTBEAT_INTERVAL_MS = STALE_CLAIM_THRESHOLD_MS / 4;

// Longer than the stale threshold on purpose: the heartbeat lets a slow batch outlive it. This is the backstop
// for a handle() that never settles, which would otherwise hold the per-consumer flush job until a restart.
// It can't cancel the work, so an abandoned batch may still deliver and then deliver again on retry.
const CONSUMER_HANDLE_TIMEOUT_MS = 3 * STALE_CLAIM_THRESHOLD_MS;

const COMMIT_ATTEMPTS = 3;
const COMMIT_RETRY_DELAY_MS = 250;

const toEvent = (entry: OutboxEntry): TEvent => ({
  specversion: "1.0",
  id: entry.eventId,
  source: EventDefinition.sourceOf(entry.eventType),
  type: entry.eventType,
  time: entry.occurredAt.toISOString(),
  data: entry.payload,
  isFinalAttempt: entry.isFinalAttempt()
});

export type TEventDeliveryService = {
  // Delivers a consumer's due events now, in bounded batches.
  drain(consumer: string): Promise<{ handled: number; unknownConsumer: boolean }>;
  // Queues a flush for every consumer with due events.
  relayDueEvents(): Promise<void>;
  sweepStaleClaims(): Promise<void>;
  pruneTerminalRows(): Promise<void>;
};

export class EventDeliveryService implements TEventDeliveryService {
  constructor(
    private readonly outboxEntryStore: TOutboxEntryStore,
    private readonly transactionRunner: TTransactionRunner<TEventsStores>,
    private readonly consumerRegistry: ConsumerRegistry,
    private readonly flushQueue: FlushQueue,
    private readonly metrics: TEventsMetrics
  ) {}

  // Only sees consumers registered in this process. Rows for other names wait.
  async relayDueEvents(): Promise<void> {
    const consumers = await this.outboxEntryStore.findDueConsumers(this.consumerRegistry.names());

    if (consumers.length > 0) {
      await Promise.all(consumers.map((consumer) => this.flushQueue.enqueue(consumer)));
    }

    if (this.metrics.isEnabled()) {
      this.metrics.recordOldestPending(await this.outboxEntryStore.findOldestPendingAgeSeconds());
    }
  }

  // Bounded so a deep backlog can't hog a worker. The next relay tick picks up the rest.
  async drain(consumerName: string): Promise<{ handled: number; unknownConsumer: boolean }> {
    const consumer = this.consumerRegistry.get(consumerName);
    if (!consumer) {
      logger.error(`event-outbox: no consumer registered under '${consumerName}'; leaving its events untouched`);
      return { handled: 0, unknownConsumer: true };
    }

    let handled = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_FLUSH; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- batches are serial on purpose, to stay paced
      const claim = await this.outboxEntryStore.claimBatch(consumerName, OUTBOX_CLAIM_BATCH_SIZE);
      if (claim.isEmpty) break;

      // eslint-disable-next-line no-await-in-loop -- see above
      const results = await this.handleClaimed(consumer, claim);
      // eslint-disable-next-line no-await-in-loop -- see above
      await this.settle(consumerName, claim, results);
      handled += claim.entries.length;
    }

    return { handled, unknownConsumer: false };
  }

  async sweepStaleClaims(): Promise<void> {
    let retried = 0;
    const failed: OutboxEntry[] = [];

    for (let batch = 0; batch < STALE_SWEEP_MAX_BATCHES; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- batches must run serially to stay paced
      const expired = await this.transactionRunner.run(async ({ stores }) => {
        const stale = await stores.outboxEntryStore.lockStaleClaims({
          thresholdMs: STALE_CLAIM_THRESHOLD_MS,
          limit: STALE_SWEEP_BATCH_SIZE
        });
        if (stale.length === 0) return stale;

        stale.forEach((entry) => entry.expireClaim());
        await stores.outboxEntryStore.saveExpired(stale);
        return stale;
      });

      for (const entry of expired) {
        if (entry.status === EventOutboxStatus.Failed) {
          failed.push(entry);
        } else {
          retried += 1;
        }
      }
      if (expired.length < STALE_SWEEP_BATCH_SIZE) break;
    }

    for (const [consumer, entries] of Object.entries(groupBy(failed, (entry) => entry.consumer))) {
      const count = entries.length;
      this.metrics.recordExhausted({ consumer, count });
      logger.error(
        `event-outbox: gave up on ${count} event(s) whose worker never reported back [consumer=${consumer}] [thresholdMs=${STALE_CLAIM_THRESHOLD_MS}]`
      );
    }

    if (retried > 0 || failed.length > 0) {
      logger.warn(
        `event-outbox: recovered stale claims [retried=${retried}] [failed=${failed.length}] [thresholdMs=${STALE_CLAIM_THRESHOLD_MS}]`
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
  private async handleClaimed(consumer: TEventConsumer, claim: OutboxClaim): Promise<TEventConsumerResult[]> {
    const { entries } = claim;
    const heartbeat = setInterval(() => {
      this.outboxEntryStore.extendClaim(claim).catch((error) => {
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

  private async settle(consumer: string, claim: OutboxClaim, results: TEventConsumerResult[]): Promise<void> {
    const { entries } = claim;
    claim.settle(results);

    const now = Date.now();
    for (const entry of entries) {
      this.metrics.recordLag({
        consumer: entry.consumer,
        status: entry.status,
        seconds: (now - entry.occurredAt.getTime()) / 1000
      });
    }

    const settled = await this.saveSettledWithRetry(consumer, claim);
    if (settled < entries.length) {
      logger.warn(
        `event-outbox: settled ${settled} of ${entries.length} row(s); the rest were no longer held by this claim [consumer=${consumer}]`
      );
    }

    const failed = entries.filter((entry) => entry.status === EventOutboxStatus.Failed);
    if (failed.length > 0) {
      this.metrics.recordExhausted({ consumer, count: failed.length });
      const reasons = [...new Set(failed.map((entry) => entry.lastError ?? "unknown"))].join(" | ");
      logger.error(`event-outbox: gave up on ${failed.length} event(s) [consumer=${consumer}]: ${reasons}`);
    }
  }

  // The consumer already delivered, so retry a transient failure here instead of leaving it to the sweeper,
  // which would deliver the batch again.
  private async saveSettledWithRetry(consumer: string, claim: OutboxClaim): Promise<number> {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop -- retrying the same statement is the point
        return await this.transactionRunner.run(({ stores }) => stores.outboxEntryStore.saveSettled(claim));
      } catch (error) {
        if (attempt >= COMMIT_ATTEMPTS) throw error;
        logger.warn(
          error,
          `event-outbox: failed to commit results, retrying [attempt=${attempt}] [consumer=${consumer}]`
        );
        // eslint-disable-next-line no-await-in-loop -- see above
        await delay(COMMIT_RETRY_DELAY_MS * attempt);
      }
    }
  }
}
