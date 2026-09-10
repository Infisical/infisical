import { Knex } from "knex";

import { TEventOutbox } from "@app/db/schemas";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { recordEventOutboxExhaustedMetric, recordEventOutboxLagMetric } from "@app/lib/telemetry/metrics";

import { TEventOutboxDALFactory, TOutboxInsertRow } from "./event-outbox-dal";
import { TEventOutboxRegistry } from "./event-outbox-registry";
import {
  computeBackoffMs,
  DELIVERED_RETENTION_MS,
  EventOutboxStatus,
  FAILED_RETENTION_MS,
  IEventOutboxConsumer,
  MAX_BATCHES_PER_FLUSH,
  MAX_OUTBOX_ATTEMPTS,
  MAX_OUTBOX_PAYLOAD_BYTES,
  OUTBOX_CLAIM_BATCH_SIZE,
  OutboxEventSchema,
  STALE_CLAIM_THRESHOLD_MS,
  TOutboxEvent,
  TOutboxFlushKey,
  TOutboxRowResult
} from "./event-outbox-types";

const PRUNE_BATCH_SIZE = 5_000;
const PRUNE_MAX_BATCHES = 20;

const STALE_SWEEP_BATCH_SIZE = 1_000;
const STALE_SWEEP_MAX_BATCHES = 10;

// A quarter of the threshold, so one missed beat doesn't let the sweeper call a live claim stale.
const CLAIM_HEARTBEAT_INTERVAL_MS = STALE_CLAIM_THRESHOLD_MS / 4;

const COMMIT_ATTEMPTS = 3;
const COMMIT_RETRY_DELAY_MS = 250;

const sleep = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
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
  // `tx` is required on purpose: the row has to commit with the business write. Nothing here reads the
  // DB or calls into a consumer, and nothing is caught: a bad event is a bug at the emit site (so 500,
  // not 400), and swallowing a failed insert would leave the caller with a poisoned transaction.
  const emit = async (event: TOutboxEvent, tx: Knex): Promise<void> => {
    const parsed = OutboxEventSchema.safeParse(event);
    if (!parsed.success) {
      throw new InternalServerError({
        name: "EventOutboxInvalidEvent",
        message: `Invalid outbox event: ${formatIssues(parsed.error.issues)}`
      });
    }
    const validated = parsed.data;

    const payloadBytes = Buffer.byteLength(JSON.stringify(validated.payload), "utf8");
    if (payloadBytes > MAX_OUTBOX_PAYLOAD_BYTES) {
      throw new InternalServerError({
        name: "EventOutboxPayloadTooLarge",
        message: `Outbox event payload for '${validated.eventType}' is ${payloadBytes} bytes, over the ${MAX_OUTBOX_PAYLOAD_BYTES} byte limit. The outbox carries identifiers, not documents.`
      });
    }

    const subscribers = eventOutboxRegistry.subscribersOf(validated.eventType);
    if (subscribers.length === 0) return;

    const occurredAt = validated.occurredAt ?? new Date();

    const rows: TOutboxInsertRow[] = subscribers.map((consumer) => {
      const payload = consumer.payloadSchema.safeParse(validated.payload);
      if (!payload.success) {
        throw new InternalServerError({
          name: "EventOutboxPayloadRejected",
          message: `Outbox event '${validated.eventType}' has a payload the '${consumer.name}' consumer cannot accept: ${formatIssues(payload.error.issues)}`
        });
      }

      return {
        consumer: consumer.name,
        eventType: validated.eventType,
        resourceType: validated.resourceType,
        resourceId: validated.resourceId,
        orgId: validated.orgId,
        projectId: validated.projectId ?? null,
        payload: validated.payload,
        idempotencyKey: validated.idempotencyKey ?? null,
        occurredAt
      };
    });

    await eventOutboxDAL.insertEvents(rows, tx);
  };

  const $commitWithRetry = async (
    { consumer, resourceType, resourceId }: TOutboxFlushKey,
    input: Parameters<TEventOutboxDALFactory["commitResults"]>[0]
  ): Promise<void> => {
    for (let attempt = 1; ; attempt += 1) {
      try {
        // eslint-disable-next-line no-await-in-loop -- retrying the same statement is the point
        await eventOutboxDAL.commitResults(input);
        return;
      } catch (error) {
        if (attempt >= COMMIT_ATTEMPTS) throw error;
        logger.warn(
          error,
          `event-outbox: failed to commit results, retrying [attempt=${attempt}] [consumer=${consumer}] [resourceType=${resourceType}] [resourceId=${resourceId}]`
        );
        // eslint-disable-next-line no-await-in-loop -- see above
        await sleep(COMMIT_RETRY_DELAY_MS * attempt);
      }
    }
  };

  const $applyResults = async (rows: TEventOutbox[], results: TOutboxRowResult[]): Promise<void> => {
    const byId = new Map(results.map((result) => [result.id, result]));
    const now = Date.now();

    const delivered: { id: string; progress?: Record<string, unknown> | null }[] = [];
    const retriable: {
      id: string;
      nextRetryDelayMs: number;
      progress?: Record<string, unknown> | null;
      error?: string;
    }[] = [];
    const failed: { id: string; error?: string }[] = [];
    const backoffByAttempt = new Map<number, number>();

    for (const row of rows) {
      const id = String(row.id);
      // No result means unaccounted for, not delivered.
      const result = byId.get(id) ?? {
        id,
        status: EventOutboxStatus.Retry as const,
        error: "Consumer returned no result for this event"
      };

      const attempts = row.attempts + 1;
      let finalStatus: TOutboxRowResult["status"];
      if (result.status === EventOutboxStatus.Delivered) {
        finalStatus = EventOutboxStatus.Delivered;
        delivered.push({ id, progress: result.progress });
      } else if (result.status === EventOutboxStatus.Failed || attempts >= MAX_OUTBOX_ATTEMPTS) {
        finalStatus = EventOutboxStatus.Failed;
        failed.push({ id, error: result.error });
      } else {
        finalStatus = EventOutboxStatus.Retry;
        let nextRetryDelayMs = backoffByAttempt.get(attempts);
        if (nextRetryDelayMs === undefined) {
          nextRetryDelayMs = computeBackoffMs(attempts);
          backoffByAttempt.set(attempts, nextRetryDelayMs);
        }
        retriable.push({ id, nextRetryDelayMs, progress: result.progress, error: result.error });
      }

      recordEventOutboxLagMetric({
        consumer: row.consumer,
        status: finalStatus,
        seconds: (now - new Date(row.occurredAt).getTime()) / 1000
      });
    }

    await $commitWithRetry(rows[0], {
      delivered: groupByOutcome(delivered, (item) => JSON.stringify(item.progress ?? null)),
      retriable: groupByOutcome(retriable, (item) =>
        JSON.stringify([item.nextRetryDelayMs, item.error ?? null, item.progress ?? null])
      ),
      failed: groupByOutcome(failed, (item) => item.error ?? "")
    });

    if (failed.length > 0) {
      const { consumer, resourceType, resourceId } = rows[0];
      recordEventOutboxExhaustedMetric({ consumer, count: failed.length });
      const reasons = [...new Set(failed.map((item) => item.error ?? "unknown"))].join(" | ");
      logger.error(
        `event-outbox: gave up on ${failed.length} event(s) [consumer=${consumer}] [resourceType=${resourceType}] [resourceId=${resourceId}]: ${reasons}`
      );
    }
  };

  // The heartbeat lets a slow batch outlive STALE_CLAIM_THRESHOLD_MS without being delivered twice.
  const $handleClaimed = async (
    consumer: IEventOutboxConsumer,
    key: TOutboxFlushKey,
    claimed: TEventOutbox[]
  ): Promise<TOutboxRowResult[]> => {
    const ids = claimed.map((row) => String(row.id));
    const heartbeat = setInterval(() => {
      eventOutboxDAL.extendClaims(ids).catch((error) => {
        logger.warn(
          error,
          `event-outbox: failed to extend a claim [consumer=${key.consumer}] [resourceType=${key.resourceType}] [resourceId=${key.resourceId}]`
        );
      });
    }, CLAIM_HEARTBEAT_INTERVAL_MS);

    try {
      return await consumer.handle(claimed);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      logger.error(
        error,
        `event-outbox: consumer '${key.consumer}' threw while handling a batch [resourceType=${key.resourceType}] [resourceId=${key.resourceId}]`
      );
      return claimed.map((row) => ({ id: String(row.id), status: EventOutboxStatus.Retry as const, error: message }));
    } finally {
      clearInterval(heartbeat);
    }
  };

  // Bounded so one busy resource can't hold a worker forever; the relay's next tick picks up the rest.
  const drain = async (key: TOutboxFlushKey): Promise<{ handled: number; unknownConsumer: boolean }> => {
    const consumer = eventOutboxRegistry.get(key.consumer);
    if (!consumer) {
      logger.error(
        `event-outbox: no consumer registered under '${key.consumer}'; leaving its events untouched [resourceType=${key.resourceType}] [resourceId=${key.resourceId}]`
      );
      return { handled: 0, unknownConsumer: true };
    }

    let handled = 0;

    for (let batch = 0; batch < MAX_BATCHES_PER_FLUSH; batch += 1) {
      // eslint-disable-next-line no-await-in-loop -- batches are serial on purpose, to stay paced
      const claimed = await eventOutboxDAL.claimBatch(key, OUTBOX_CLAIM_BATCH_SIZE);
      if (claimed.length === 0) break;

      // eslint-disable-next-line no-await-in-loop -- see above
      const results = await $handleClaimed(consumer, key, claimed);
      // eslint-disable-next-line no-await-in-loop -- see above
      await $applyResults(claimed, results);
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

export type TEventOutboxEmitter = Pick<TEventOutboxServiceFactory, "emit">;
