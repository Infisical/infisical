import { Knex } from "knex";

import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import {
  EventOutboxRejectReason,
  recordEventOutboxExhaustedMetric,
  recordEventOutboxLagMetric,
  recordEventOutboxRejectedMetric
} from "@app/lib/telemetry/metrics";

import { eventSource } from "./event-definition";
import { TClaimedOutboxRow, TEventOutboxDALFactory, TOutboxInsertRow } from "./event-outbox-dal";
import { TEventOutboxRegistry } from "./event-outbox-registry";
import {
  computeBackoffMs,
  DELIVERED_RETENTION_MS,
  EventInputSchema,
  EventOutboxStatus,
  EventResultStatus,
  FAILED_RETENTION_MS,
  IEventConsumer,
  isFinalOutboxAttempt,
  MAX_BATCHES_PER_FLUSH,
  MAX_OUTBOX_ATTEMPTS,
  MAX_OUTBOX_PAYLOAD_BYTES,
  OUTBOX_CLAIM_BATCH_SIZE,
  STALE_CLAIM_THRESHOLD_MS,
  TEvent,
  TEventConsumerResult,
  TEventInput,
  TOutboxFlushKey
} from "./event-outbox-types";

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

class ConsumerHandleTimeoutError extends Error {
  constructor(consumer: string, ms: number) {
    super(`Consumer '${consumer}' did not finish handling the batch within ${ms / 1000}s`);
    this.name = "ConsumerHandleTimeoutError";
  }
}

const withTimeout = async <T>(promise: Promise<T>, ms: number, makeError: () => Error): Promise<T> => {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(makeError()), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

const toEvent = (row: TClaimedOutboxRow): TEvent => ({
  specversion: "1.0",
  id: row.eventId,
  source: eventSource(row.eventType),
  type: row.eventType,
  time: new Date(row.occurredAt).toISOString(),
  data: row.payload,
  isFinalAttempt: isFinalOutboxAttempt(row.attempts)
});

const formatIssues = (issues: { path: (string | number)[]; message: string }[]) =>
  issues.map((issue) => `${issue.path.join(".")} ${issue.message}`).join(", ");

// Lets commitResults issue one UPDATE per distinct outcome instead of one per row.
const groupByOutcome = <TItem extends { id: string }>(
  items: TItem[],
  keyOf: (item: TItem) => string
): (Omit<TItem, "id"> & { ids: string[] })[] => {
  const groups = new Map<string, Omit<TItem, "id"> & { ids: string[] }>();
  for (const item of items) {
    const key = keyOf(item);
    const group = groups.get(key);
    if (group) {
      group.ids.push(item.id);
    } else {
      const { id, ...rest } = item;
      groups.set(key, { ...rest, ids: [id] });
    }
  }
  return [...groups.values()];
};

export type TEventOutboxServiceFactoryDep = {
  eventOutboxDAL: TEventOutboxDALFactory;
  eventOutboxRegistry: TEventOutboxRegistry;
};

export type TEventOutboxServiceFactory = ReturnType<typeof eventOutboxServiceFactory>;

export const eventOutboxServiceFactory = ({ eventOutboxDAL, eventOutboxRegistry }: TEventOutboxServiceFactoryDep) => {
  // A malformed event is a bug at the emit site. Throwing fails the caller's transaction on purpose: a
  // write that commits without its event is a change consumers never hear about. All checks run before
  // any DB access.
  const $reject = (type: string, reason: EventOutboxRejectReason, detail: string, consumer?: string): never => {
    logger.error(
      `event-outbox: rejected event [type=${type}] [reason=${reason}]${consumer ? ` [consumer=${consumer}]` : ""}: ${detail}`
    );
    recordEventOutboxRejectedMetric({ eventType: type, reason, consumer });
    throw new InternalServerError({
      message:
        "Infisical could not record an event for this change, so the change was not saved. Contact support and include the request ID."
    });
  };

  const $buildRows = (event: TEventInput): TOutboxInsertRow[] => {
    const parsed = EventInputSchema.safeParse(event);
    if (!parsed.success) {
      return $reject(event.type, EventOutboxRejectReason.InvalidEvent, formatIssues(parsed.error.issues));
    }
    const validated = parsed.data;

    const dataBytes = Buffer.byteLength(JSON.stringify(validated.data), "utf8");
    if (dataBytes > MAX_OUTBOX_PAYLOAD_BYTES) {
      return $reject(
        validated.type,
        EventOutboxRejectReason.DataTooLarge,
        `data is ${dataBytes} bytes, over the ${MAX_OUTBOX_PAYLOAD_BYTES} byte limit; the outbox carries identifiers, not documents`
      );
    }

    const occurredAt = validated.time ?? new Date();

    return eventOutboxRegistry.subscribersOf(validated.type).map((consumer) => {
      const data = consumer.dataSchema.safeParse(validated.data);
      if (!data.success) {
        return $reject(
          validated.type,
          EventOutboxRejectReason.DataRejected,
          formatIssues(data.error.issues),
          consumer.name
        );
      }

      return {
        consumer: consumer.name,
        eventId: validated.id,
        eventType: validated.type,
        payload: validated.data,
        occurredAt
      };
    });
  };

  // Pass the caller's `tx` so the rows commit with the business write. A failed insert is not caught:
  // swallowing it would hand the caller a poisoned transaction.
  const emit = async (events: TEventInput[], tx?: Knex): Promise<void> => {
    const rows = events.flatMap($buildRows);
    if (rows.length === 0) return;

    await eventOutboxDAL.insertEvents(rows, tx);
  };

  const $commitWithRetry = async (
    { consumer }: TOutboxFlushKey,
    input: Parameters<TEventOutboxDALFactory["commitResults"]>[0]
  ): Promise<number> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop -- retrying the same statement is the point
        return await eventOutboxDAL.commitResults(input);
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
  };

  const $applyResults = async (
    rows: TClaimedOutboxRow[],
    lockToken: string,
    results: TEventConsumerResult[]
  ): Promise<void> => {
    const byEventId = new Map(results.map((result) => [result.id, result]));
    const now = Date.now();

    const delivered: { id: string }[] = [];
    const retriable: { id: string; nextRetryDelayMs: number; error?: string }[] = [];
    const failed: { id: string; error?: string }[] = [];
    const backoffByAttempt = new Map<number, number>();

    for (const row of rows) {
      const id = String(row.id);
      // No result means unaccounted for, not delivered.
      const result = byEventId.get(row.eventId) ?? {
        status: EventResultStatus.Retry,
        error: "Consumer returned no result for this event"
      };

      const attempts = row.attempts + 1;
      let finalStatus: EventOutboxStatus;
      if (result.status === EventResultStatus.Delivered) {
        finalStatus = EventOutboxStatus.Delivered;
        delivered.push({ id });
      } else if (result.status === EventResultStatus.Failed || isFinalOutboxAttempt(row.attempts)) {
        finalStatus = EventOutboxStatus.Failed;
        failed.push({ id, error: result.error });
      } else {
        finalStatus = EventOutboxStatus.Retry;
        let nextRetryDelayMs = backoffByAttempt.get(attempts);
        if (nextRetryDelayMs === undefined) {
          nextRetryDelayMs = computeBackoffMs(attempts);
          backoffByAttempt.set(attempts, nextRetryDelayMs);
        }
        retriable.push({ id, nextRetryDelayMs, error: result.error });
      }

      recordEventOutboxLagMetric({
        consumer: row.consumer,
        status: finalStatus,
        seconds: (now - new Date(row.occurredAt).getTime()) / 1000
      });
    }

    const settled = await $commitWithRetry(rows[0], {
      lockToken,
      delivered: groupByOutcome(delivered, () => ""),
      retriable: groupByOutcome(retriable, (item) => JSON.stringify([item.nextRetryDelayMs, item.error ?? null])),
      failed: groupByOutcome(failed, (item) => item.error ?? "")
    });

    const { consumer } = rows[0];
    if (settled < rows.length) {
      logger.warn(
        `event-outbox: settled ${settled} of ${rows.length} row(s); the rest were no longer held by this claim [consumer=${consumer}]`
      );
    }

    if (failed.length > 0) {
      recordEventOutboxExhaustedMetric({ consumer, count: failed.length });
      const reasons = [...new Set(failed.map((item) => item.error ?? "unknown"))].join(" | ");
      logger.error(`event-outbox: gave up on ${failed.length} event(s) [consumer=${consumer}]: ${reasons}`);
    }
  };

  // The heartbeat lets a slow batch outlive STALE_CLAIM_THRESHOLD_MS without being delivered twice.
  const $handleClaimed = async (
    consumer: IEventConsumer,
    key: TOutboxFlushKey,
    claimed: TClaimedOutboxRow[],
    lockToken: string
  ): Promise<TEventConsumerResult[]> => {
    const ids = claimed.map((row) => String(row.id));
    const heartbeat = setInterval(() => {
      eventOutboxDAL.extendClaims(ids, lockToken).catch((error) => {
        logger.warn(error, `event-outbox: failed to extend a claim [consumer=${key.consumer}]`);
      });
    }, CLAIM_HEARTBEAT_INTERVAL_MS);

    try {
      return await withTimeout(
        consumer.handle(claimed.map(toEvent)),
        CONSUMER_HANDLE_TIMEOUT_MS,
        () => new ConsumerHandleTimeoutError(key.consumer, CONSUMER_HANDLE_TIMEOUT_MS)
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      if (error instanceof ConsumerHandleTimeoutError) {
        logger.error(
          `event-outbox: consumer '${key.consumer}' timed out on a batch of ${claimed.length}; retrying it later [timeoutMs=${CONSUMER_HANDLE_TIMEOUT_MS}]`
        );
      } else {
        logger.error(error, `event-outbox: consumer '${key.consumer}' threw while handling a batch`);
      }
      return claimed.map((row) => ({ id: row.eventId, status: EventResultStatus.Retry, error: message }));
    } finally {
      clearInterval(heartbeat);
    }
  };

  // Bounded so a deep backlog can't hold a worker forever; the relay's next tick picks up the rest.
  const drain = async (key: TOutboxFlushKey): Promise<{ handled: number; unknownConsumer: boolean }> => {
    const consumer = eventOutboxRegistry.get(key.consumer);
    if (!consumer) {
      logger.error(`event-outbox: no consumer registered under '${key.consumer}'; leaving its events untouched`);
      return { handled: 0, unknownConsumer: true };
    }

    let handled = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_FLUSH; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- batches are serial on purpose, to stay paced
      const { lockToken, rows: claimed } = await eventOutboxDAL.claimBatch(key, OUTBOX_CLAIM_BATCH_SIZE);
      if (claimed.length === 0) break;

      // eslint-disable-next-line no-await-in-loop -- see above
      const results = await $handleClaimed(consumer, key, claimed, lockToken);
      // eslint-disable-next-line no-await-in-loop -- see above
      await $applyResults(claimed, lockToken, results);
      handled += claimed.length;
    }

    return { handled, unknownConsumer: false };
  };

  const sweepStaleClaims = async (): Promise<void> => {
    let retried = 0;
    const failedByConsumer = new Map<string, number>();

    for (let batch = 0; batch < STALE_SWEEP_MAX_BATCHES; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- batches must run serially to stay paced
      const outcome = await eventOutboxDAL.recoverStaleClaims({
        thresholdMs: STALE_CLAIM_THRESHOLD_MS,
        maxAttempts: MAX_OUTBOX_ATTEMPTS,
        limit: STALE_SWEEP_BATCH_SIZE
      });
      retried += outcome.retried;
      let failedInBatch = 0;
      for (const { consumer, count } of outcome.failed) {
        failedInBatch += count;
        failedByConsumer.set(consumer, (failedByConsumer.get(consumer) ?? 0) + count);
      }
      if (outcome.retried + failedInBatch < STALE_SWEEP_BATCH_SIZE) break;
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
  };

  const pruneTerminalRows = async (): Promise<void> => {
    const now = Date.now();
    let deleted = 0;

    for (let batch = 0; batch < PRUNE_MAX_BATCHES; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- batches must run serially to stay paced
      const removed = await eventOutboxDAL.deleteTerminalOlderThan({
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
  };

  return { emit, drain, sweepStaleClaims, pruneTerminalRows };
};
