import { TAuditLogs } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { chunkArray } from "@app/lib/fn";
import { logger } from "@app/lib/logger";
import {
  auditLogStreamDeliveryDurationHistogram,
  auditLogStreamDeliveryExhaustedCounter
} from "@app/lib/telemetry/metrics";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { chunkAuditLogsByBatchLimit } from "../audit-log-stream/audit-log-stream-batching";
import { TAuditLogStreamDALFactory } from "../audit-log-stream/audit-log-stream-dal";
import { LogProvider, StreamMode } from "../audit-log-stream/audit-log-stream-enums";
import { LOG_STREAM_FACTORY_MAP } from "../audit-log-stream/audit-log-stream-factory";
import {
  auditLogMatchesStreamFilter,
  decryptLogStreamCredentials,
  resolveAuditLogProduct,
  streamHasProductFilter
} from "../audit-log-stream/audit-log-stream-fns";
import { TAuditLogStreamFilters } from "../audit-log-stream/audit-log-stream-schemas";
import { TAuditLogStreamOutboxDALFactory } from "./audit-log-stream-outbox-dal";
import {
  TAuditLogStreamFlushJobData,
  TAuditLogStreamOutboxRow,
  TFailedStreamRow
} from "./audit-log-stream-outbox-types";

// Debounce window: first writer for a stream enqueues a flush job delayed by this many ms.
// Subsequent writers within the window are absorbed by the same job (SETNX is a no-op for them).
const FLUSH_DEBOUNCE_MS = 5_000;
const FLUSH_DEBOUNCE_SECONDS = Math.ceil(FLUSH_DEBOUNCE_MS / 1_000);

// Worker drain settings.
const BATCH_SIZE = 500;
const MAX_BATCHES_PER_JOB = 10; // hard cap so one job can't monopolize the worker
const MAX_ATTEMPTS = 5;
// Single mode sends one request per row, so a full claim is up to BATCH_SIZE serial
// POSTs. Dispatch them in parallel waves of this size instead — bounded so we don't
// open BATCH_SIZE concurrent connections to a legacy webhook receiver at once.
const SINGLE_MODE_SEND_CONCURRENCY = 5;
// Exponential backoff with jitter — keeps a wedged provider from hot-looping. The
// exponent is clamped (see computeBackoffMs) so the base can't run away if MAX_ATTEMPTS
// is ever raised; with the current MAX_ATTEMPTS the schedule tops out at ~240s.
const BACKOFF_BASE_MS = 30_000;

// Stale-claim sweeper threshold: a single flush job's worst-case legitimate
// hold time is MAX_BATCHES_PER_JOB × AUDIT_LOG_STREAM_BATCH_TIMEOUT ≈ 5 min.
// Anything older than this can't be a live worker.
export const STALE_CLAIM_THRESHOLD_MS = 10 * 60_000;

// Retention for 'delivered' outbox rows. The row is the dedup guard against a
// re-fanout from the ingest consumer (e.g. after a Redis streamTrim failure),
// so the retention only needs to outlive how long an ingest-stream entry can
// stay un-trimmed in practice. The ingest stream trims every ~5s, so 15m is
// already 100×+ that window; the unique (streamId, auditLogId) constraint is the
// hard dedup guarantee, this is just the belt-and-suspenders margin. Kept short
// so the 'delivered' rows (the table's hottest section) don't pile up.
export const DELIVERED_RETENTION_MS = 15 * 60_000;

const computeBackoffMs = (attemptsAfterIncrement: number): number => {
  const exponent = Math.min(attemptsAfterIncrement - 1, 10);
  const base = BACKOFF_BASE_MS * 2 ** exponent;
  const jitter = Math.floor(Math.random() * Math.min(base / 2, 30_000));
  return base + jitter;
};

export type TAuditLogStreamOutboxServiceFactoryDep = {
  auditLogStreamOutboxDAL: TAuditLogStreamOutboxDALFactory;
  auditLogStreamDAL: Pick<TAuditLogStreamDALFactory, "find" | "findById">;
  projectDAL: Pick<TProjectDALFactory, "findProjectTypesByIds">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  queueService: TQueueServiceFactory;
};

export type TAuditLogStreamOutboxServiceFactory = {
  enqueueForLogs: (auditLogs: TAuditLogs[]) => Promise<void>;
  drainStream: (data: TAuditLogStreamFlushJobData) => Promise<void>;
  sweepStaleClaims: () => Promise<void>;
  pruneDeliveredRows: () => Promise<void>;
};

export const auditLogStreamOutboxServiceFactory = ({
  auditLogStreamOutboxDAL,
  auditLogStreamDAL,
  projectDAL,
  kmsService,
  keyStore,
  queueService
}: TAuditLogStreamOutboxServiceFactoryDep): TAuditLogStreamOutboxServiceFactory => {
  // Try to win the 5s SETNX debounce for a stream and, on win, enqueue a delayed
  // flush job on the shared outbox queue (provider is carried in the payload and read
  // back by the worker). Returning false means another writer already covered the
  // window — there's nothing for the caller to do.
  const debounceAndEnqueueFlush = async (streamId: string, orgId: string, provider: LogProvider): Promise<boolean> => {
    const debounceKey = KeyStorePrefixes.AuditLogStreamFlushDebounce(streamId);
    const acquired = await keyStore.setItemWithExpiryNX(debounceKey, FLUSH_DEBOUNCE_SECONDS, "1");
    if (!acquired) return false;

    try {
      await queueService.queue(
        QueueName.AuditLogStreamOutbox,
        QueueJobs.AuditLogStreamFlush,
        { streamId, orgId, provider },
        {
          jobId: `flush-${streamId}`,
          delay: FLUSH_DEBOUNCE_MS,
          removeOnComplete: true,
          removeOnFail: true
        }
      );
    } catch (error) {
      logger.error(
        error,
        `audit-log-stream-outbox: failed to enqueue flush job [provider=${provider}] [streamId=${streamId}] [orgId=${orgId}]`
      );
      return false;
    }
    return true;
  };

  // Batch fanout for a drained set of audit logs:
  //   1. Group logs by org so active streams are looked up once per org (not per log).
  //   2. Insert one outbox row per (stream, log) in a single batch insert.
  //   3. For each stream that received rows, try to win the 5s debounce SETNX once.
  //      The winner enqueues the flush job (delayed by FLUSH_DEBOUNCE_MS) on the
  //      provider queue; losers do nothing because their events are already covered.
  const enqueueForLogs = async (auditLogs: TAuditLogs[]) => {
    if (auditLogs.length === 0) return;

    const logsByOrg = new Map<string, TAuditLogs[]>();
    for (const log of auditLogs) {
      if (log.orgId) {
        const existing = logsByOrg.get(log.orgId);
        if (existing) existing.push(log);
        else logsByOrg.set(log.orgId, [log]);
      }
    }

    // No log in the batch carried an orgId — nothing to fan out, skip the stream lookup.
    if (logsByOrg.size === 0) return;

    const outboxRows: { streamId: string; orgId: string; payload: TAuditLogs }[] = [];
    // Dedup streams touched this batch so each is debounced/woken exactly once.
    const streamsToFlush = new Map<string, { orgId: string; provider: LogProvider }>();

    // One lookup for every org in the batch instead of a query per org — the common case is
    // that most orgs have no streams configured, so a per-org loop is mostly empty round-trips.
    const streams = await auditLogStreamDAL.find({ $in: { orgId: [...logsByOrg.keys()] } });

    const hasProductFilter = streams.some(streamHasProductFilter);
    let projectTypeById = new Map<string, string>();
    if (hasProductFilter) {
      const projectIds = new Set<string>();
      for (const logs of logsByOrg.values()) {
        for (const log of logs) {
          if (log.projectId) projectIds.add(log.projectId);
        }
      }
      if (projectIds.size > 0) {
        const projects = await projectDAL.findProjectTypesByIds([...projectIds]);
        projectTypeById = new Map(projects.map((project) => [project.id, project.type]));
      }
    }

    for (const stream of streams) {
      const logs = logsByOrg.get(stream.orgId);
      if (logs) {
        const filters = stream.filters as TAuditLogStreamFilters | null;
        const streamHasFilter = streamHasProductFilter(stream);
        let streamReceivedRow = false;
        for (const log of logs) {
          if (!streamHasFilter || auditLogMatchesStreamFilter(resolveAuditLogProduct(log, projectTypeById), filters)) {
            outboxRows.push({ streamId: stream.id, orgId: stream.orgId, payload: log });
            streamReceivedRow = true;
          }
        }

        // Only wake a stream that actually received rows — a fully-filtered-out stream has nothing to flush.
        if (streamReceivedRow) {
          streamsToFlush.set(stream.id, { orgId: stream.orgId, provider: stream.provider as LogProvider });
        }
      }
    }

    if (outboxRows.length === 0) return;

    await auditLogStreamOutboxDAL.batchInsert(outboxRows);

    await Promise.allSettled(
      Array.from(streamsToFlush.entries()).map(([streamId, { orgId, provider }]) =>
        debounceAndEnqueueFlush(streamId, orgId, provider)
      )
    );
  };

  // Worker entrypoint. Loops claim→send→ack while there are still rows pending
  // for this stream, but bounded by MAX_BATCHES_PER_JOB so one wedged stream
  // can't hold the worker hostage. If rows remain when we bail, the next event
  // for the stream will debounce-enqueue another flush.
  const drainStream = async ({ streamId, orgId, provider }: TAuditLogStreamFlushJobData) => {
    const stream = await auditLogStreamDAL.findById(streamId);
    if (!stream) {
      logger.warn(`audit-log-stream-outbox: stream deleted, dropping flush [streamId=${streamId}]`);
      return;
    }

    const factory = LOG_STREAM_FACTORY_MAP[provider];
    if (!factory) {
      logger.error(`audit-log-stream-outbox: unknown provider [provider=${provider}] [streamId=${streamId}]`);
      return;
    }

    const credentials = await decryptLogStreamCredentials({
      encryptedCredentials: stream.encryptedCredentials,
      orgId: stream.orgId,
      kmsService
    });

    const providerImpl = factory();

    // "single" streams (legacy custom/cribl receivers) get one event per request; everything
    // else gets a JSON array per request. Single mode treats each row as its own chunk.
    const isSingleMode = stream.streamMode === StreamMode.Single;

    for (let batchIdx = 0; batchIdx < MAX_BATCHES_PER_JOB; batchIdx += 1) {
      // eslint-disable-next-line no-await-in-loop
      const claimed = await auditLogStreamOutboxDAL.claimBatchForStream(streamId, BATCH_SIZE);
      if (claimed.length === 0) return;

      const chunks = isSingleMode
        ? claimed.map((row) => [row])
        : chunkAuditLogsByBatchLimit(claimed, providerImpl.getProviderBatchLimit());
      const streamSuccess: TAuditLogStreamOutboxRow[] = [];
      const streamFail: TFailedStreamRow[] = [];

      const sendChunk = async (chunk: TAuditLogStreamOutboxRow[]) => {
        const deliveryStart = Date.now();
        const metricAttrs = {
          "audit_log_stream.provider": provider
        };
        try {
          if (isSingleMode) {
            if (!providerImpl.streamLog) {
              throw new Error(`provider '${provider}' does not support single stream mode`);
            }
            await providerImpl.streamLog({ credentials, auditLog: chunk[0].payload });
          } else {
            await providerImpl.batchStreamLog({ credentials, auditLogs: chunk.map((row) => row.payload) });
          }
          auditLogStreamDeliveryDurationHistogram.record((Date.now() - deliveryStart) / 1000, {
            ...metricAttrs,
            outcome: "success"
          });
        } catch (error) {
          auditLogStreamDeliveryDurationHistogram.record((Date.now() - deliveryStart) / 1000, {
            ...metricAttrs,
            outcome: "failure"
          });
          throw error;
        }
      };

      const sendWaveSize = isSingleMode ? SINGLE_MODE_SEND_CONCURRENCY : 1;
      for (const wave of chunkArray(chunks, sendWaveSize)) {
        // eslint-disable-next-line no-await-in-loop
        const results = await Promise.allSettled(wave.map(sendChunk));
        results.forEach((result, idx) => {
          const chunk = wave[idx];
          if (result.status === "fulfilled") {
            streamSuccess.push(...chunk);
          } else {
            const error = result.reason as Error;
            const errorMessage = error?.message ?? "Unknown error";
            const errorType = error?.name ?? "UnknownError";
            logger.error(
              { errorType },
              `audit-log-stream-outbox: batch delivery failed [streamId=${streamId}] [orgId=${orgId}] [provider=${provider}] [chunkSize=${chunk.length}]: ${errorMessage}`
            );
            streamFail.push(...chunk.map((row) => ({ row, errorMessage })));
          }
        });
      }

      const exhausted: TFailedStreamRow[] = [];
      const retriable: TFailedStreamRow[] = [];
      for (const failed of streamFail) {
        if (failed.row.attempts + 1 >= MAX_ATTEMPTS) {
          exhausted.push(failed);
        } else {
          retriable.push(failed);
        }
      }

      const retriableByAttempts = new Map<number, number[]>();
      for (const { row } of retriable) {
        const ids = retriableByAttempts.get(row.attempts);
        if (ids) ids.push(row.id);
        else retriableByAttempts.set(row.attempts, [row.id]);
      }
      const retriableInput = retriableByAttempts.size
        ? {
            groups: Array.from(retriableByAttempts, ([attempts, ids]) => ({
              ids,
              nextRetryDelayMs: computeBackoffMs(attempts + 1)
            }))
          }
        : null;

      // There is no DLQ: once a row exhausts MAX_ATTEMPTS the event is dropped
      // (deleted in commitDeliveryResult below). Surface it as an error log +
      // metric so a wedged provider is observable. Group by error so a batch
      // failing for one reason logs once rather than per-row.
      if (exhausted.length > 0) {
        const exhaustedCountByError = new Map<string, number>();
        for (const { errorMessage } of exhausted) {
          exhaustedCountByError.set(errorMessage, (exhaustedCountByError.get(errorMessage) ?? 0) + 1);
        }
        for (const [errorMessage, count] of exhaustedCountByError) {
          logger.error(
            `audit-log-stream-outbox: dropping events after exhausting retries [streamId=${streamId}] [orgId=${orgId}] [provider=${provider}] [count=${count}] [maxAttempts=${MAX_ATTEMPTS}]: ${errorMessage}`
          );
        }
        auditLogStreamDeliveryExhaustedCounter.add(exhausted.length, {
          "audit_log_stream.id": streamId,
          "audit_log_stream.provider": provider
        });
      }

      // eslint-disable-next-line no-await-in-loop
      await auditLogStreamOutboxDAL.commitDeliveryResult({
        successIds: streamSuccess.map((row) => row.id),
        retriable: retriableInput,
        exhaustedIds: exhausted.map((failed) => failed.row.id)
      });

      if (streamFail.length > 0) {
        // Each failed chunk is already logged with its error above; the rows are
        // committed to 'retry' (or dropped if exhausted) by commitDeliveryResult.
        // Bail when this claim saw any failure. The inner loop already attempted
        // every chunk independently (so partial-success rows are committed
        // above), but hopping straight to the next claim risks compounding load
        // on a degraded endpoint — let backoff on the retriable rows govern
        // when we come back.
        return;
      }
    }
  };

  // Stale-claim sweeper. Two responsibilities, both about preventing rows from
  // getting stuck in the outbox:
  //   1. Rows whose worker crashed mid-batch stay 'processing' forever and never
  //      re-enter the drain query — flip them back to 'retry' (or drop them if
  //      attempts are exhausted).
  //   2. Rows in 'pending'/'retry' whose nextRetryAt is now in the past but never
  //      got a follow-up flush job (drainStream bailed on a chunk failure and no
  //      new event arrived after backoff). For these, enqueue a flush via the
  //      normal debounce path.
  //
  // The wake-up step does not touch row state — it only enqueues a flush. Duplicate
  // deliveries are still prevented by:
  //   - BullMQ jobId dedup ('flush:<streamId>') if a real flush is already
  //     delayed/active for the stream;
  //   - the SETNX debounce key inside debounceAndEnqueueFlush;
  //   - claimBatchForStream's FOR UPDATE SKIP LOCKED + atomic flip to 'processing'
  //     so even concurrent workers claim disjoint rows.
  const sweepStaleClaims = async () => {
    const { retried, dropped } = await auditLogStreamOutboxDAL.recoverStaleClaims(
      STALE_CLAIM_THRESHOLD_MS,
      MAX_ATTEMPTS
    );
    if (retried > 0 || dropped.length > 0) {
      logger.warn(
        `audit-log-stream-outbox: recovered stale claims [retried=${retried}] [dropped=${dropped.length}] [thresholdMs=${STALE_CLAIM_THRESHOLD_MS}]`
      );
    }
    if (dropped.length > 0) {
      // Stale claims that used up their attempts are dropped (no DLQ); count them alongside
      // delivery-path exhaustions, keyed by stream. No provider attribute here — the row doesn't carry
      // it and the sweep isn't tied to a specific delivery attempt.
      const droppedCountByStream = new Map<string, number>();
      for (const { streamId } of dropped) {
        droppedCountByStream.set(streamId, (droppedCountByStream.get(streamId) ?? 0) + 1);
      }
      for (const [streamId, count] of droppedCountByStream) {
        auditLogStreamDeliveryExhaustedCounter.add(count, {
          "audit_log_stream.id": streamId
        });
      }
    }

    const overdueStreams = await auditLogStreamOutboxDAL.findStreamsWithOverdueRows();
    if (overdueStreams.length === 0) return;

    const results = await Promise.allSettled(
      overdueStreams.map(({ streamId, orgId, provider }) =>
        debounceAndEnqueueFlush(streamId, orgId, provider as LogProvider)
      )
    );
    const woken = results.filter((r) => r.status === "fulfilled" && r.value === true).length;
    logger.info(`audit-log-stream-outbox: swept overdue streams [overdue=${overdueStreams.length}] [woken=${woken}]`);
  };

  const pruneDeliveredRows = async () => {
    const deleted = await auditLogStreamOutboxDAL.deleteDeliveredOlderThan(DELIVERED_RETENTION_MS);
    if (deleted > 0) {
      logger.info(
        `audit-log-stream-outbox: pruned delivered rows [deleted=${deleted}] [retentionMs=${DELIVERED_RETENTION_MS}]`
      );
    }
  };

  return {
    enqueueForLogs,
    drainStream,
    sweepStaleClaims,
    pruneDeliveredRows
  };
};
