import { Knex } from "knex";

import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { recordEventOutboxExhaustedMetric, recordEventOutboxLagMetric } from "@app/lib/telemetry/metrics";

import { TEventOutboxDALFactory, TOutboxInsertRow } from "./event-outbox-dal";
import { TEventOutboxRegistry } from "./event-outbox-registry";
import {
  DELIVERED_RETENTION_MS,
  EventOutboxStatus,
  FAILED_RETENTION_MS,
  IEventOutboxConsumer,
  MAX_BATCHES_PER_FLUSH,
  MAX_OUTBOX_ATTEMPTS,
  MAX_OUTBOX_PAYLOAD_BYTES,
  OUTBOX_BACKOFF_BASE_MS,
  OUTBOX_CLAIM_BATCH_SIZE,
  OutboxEventSchema,
  STALE_CLAIM_THRESHOLD_MS,
  TEventOutboxRow,
  TOutboxEvent,
  TOutboxFlushKey,
  TOutboxRowResult
} from "./event-outbox-types";

const PRUNE_BATCH_SIZE = 5_000;
const PRUNE_MAX_BATCHES = 20;

// Frequent enough that one missed beat (a slow query, a paused event loop) doesn't let the sweeper
// call a live claim stale.
const CLAIM_HEARTBEAT_INTERVAL_MS = STALE_CLAIM_THRESHOLD_MS / 4;

const computeBackoffMs = (attemptsAfterIncrement: number): number => {
  const exponent = Math.min(attemptsAfterIncrement - 1, 10);
  const base = OUTBOX_BACKOFF_BASE_MS * 2 ** exponent;
  const jitter = Math.floor(Math.random() * Math.min(base / 2, 30_000));
  return base + jitter;
};

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
  // `tx` is required, not optional: the row has to commit with the business write, so there is
  // deliberately no weaker path to reach for.
  //
  // Nothing here reads the database. Validation and consumer matching are in-memory, so this adds a
  // single insert to the caller's transaction and never calls back into a consumer. Whether anyone
  // actually wants the event is settled later in the worker, where guessing wrong only costs a row
  // that gets marked delivered and pruned.
  //
  // Nothing is caught either. A bad event is a bug at the emit site rather than something the API
  // caller can act on (hence 500, not 400), and swallowing a failed insert would hand the caller a
  // poisoned transaction instead of the real error.
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

  const $applyResults = async (rows: TEventOutboxRow[], results: TOutboxRowResult[]): Promise<void> => {
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
      // A consumer that returned nothing for a row left it unaccounted for; retry rather than
      // silently marking it delivered.
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

    await eventOutboxDAL.commitResults({
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

  // The heartbeat is what lets a batch legitimately outlive STALE_CLAIM_THRESHOLD_MS (a slow webhook
  // endpoint, many rows) without the sweeper handing its rows to a second worker mid-delivery.
  const $handleClaimed = async (
    consumer: IEventOutboxConsumer,
    key: TOutboxFlushKey,
    claimed: TEventOutboxRow[]
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

  // Bounded so one wedged resource can't hold a worker indefinitely; whatever is left over gets
  // picked up by the relay's next tick.
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
    const { retried, failed } = await eventOutboxDAL.recoverStaleClaims(STALE_CLAIM_THRESHOLD_MS, MAX_OUTBOX_ATTEMPTS);
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
