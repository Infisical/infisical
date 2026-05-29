import { isAxiosError } from "axios";

import { TAuditLogs } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { chunkAuditLogsByBatchLimit } from "../audit-log-stream/audit-log-stream-batching";
import { TAuditLogStreamDALFactory } from "../audit-log-stream/audit-log-stream-dal";
import { LogProvider } from "../audit-log-stream/audit-log-stream-enums";
import { LOG_STREAM_FACTORY_MAP } from "../audit-log-stream/audit-log-stream-factory";
import { decryptLogStreamCredentials } from "../audit-log-stream/audit-log-stream-fns";
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
// Exponential backoff with jitter, capped — keeps a wedged provider from hot-looping.
const BACKOFF_BASE_MS = 30_000;
const BACKOFF_MAX_MS = 15 * 60_000;

// Stale-claim sweeper threshold: a single flush job's worst-case legitimate
// hold time is MAX_BATCHES_PER_JOB × AUDIT_LOG_STREAM_BATCH_TIMEOUT ≈ 5 min.
// Anything older than this can't be a live worker.
export const STALE_CLAIM_THRESHOLD_MS = 10 * 60_000;

// Retention for 'delivered' outbox rows. The row is the dedup guard against a
// re-fanout from the ingest consumer (e.g. after a Redis streamTrim failure),
// so the retention only needs to outlive how long an ingest-stream entry can
// stay un-trimmed in practice. 1h is comfortably above that for any realistic
// Redis/DB blip; the cleanup cron runs hourly so rows live ~1–2h in steady state.
export const DELIVERED_RETENTION_MS = 60 * 60_000;

// Retention for DLQ entries. Long enough for an operator to notice + triage a
// wedged provider via dashboard, short enough that the table doesn't grow
// without bound. Same cron prunes these alongside delivered rows.
export const DLQ_RETENTION_MS = 24 * 60 * 60_000;

const PROVIDER_QUEUE_MAP: Record<LogProvider, QueueName> = {
  [LogProvider.Azure]: QueueName.AuditLogStreamAzure,
  [LogProvider.Cribl]: QueueName.AuditLogStreamCribl,
  [LogProvider.Custom]: QueueName.AuditLogStreamCustom,
  [LogProvider.Datadog]: QueueName.AuditLogStreamDatadog,
  [LogProvider.Splunk]: QueueName.AuditLogStreamSplunk
};

const LAST_ERROR_MAX_LENGTH = 1_000;

const computeBackoffMs = (attemptsAfterIncrement: number): number => {
  const exponent = Math.min(attemptsAfterIncrement - 1, 10);
  const base = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
  const jitter = Math.floor(Math.random() * Math.min(base / 2, 30_000));
  return base + jitter;
};

const formatErrorMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    return `${error.message ?? "Request failed"} — ${JSON.stringify(error.response?.data ?? null)}`;
  }
  return (error as Error)?.message ?? "Unknown error";
};

const truncateError = (error: unknown): string => {
  const message = formatErrorMessage(error);
  return message.length > LAST_ERROR_MAX_LENGTH ? `${message.slice(0, LAST_ERROR_MAX_LENGTH)}...` : message;
};

export type TAuditLogStreamOutboxServiceFactoryDep = {
  auditLogStreamOutboxDAL: TAuditLogStreamOutboxDALFactory;
  auditLogStreamDAL: Pick<TAuditLogStreamDALFactory, "find" | "findById">;
  kmsService: Pick<TKmsServiceFactory, "createCipherPairWithDataKey">;
  keyStore: Pick<TKeyStoreFactory, "setItemWithExpiryNX">;
  queueService: TQueueServiceFactory;
  onStreamFailure?: (input: {
    orgId: string;
    streamId: string;
    provider: LogProvider;
    errorMessage: string;
  }) => Promise<void> | void;
};

export type TAuditLogStreamOutboxServiceFactory = {
  enqueueForLogs: (auditLogs: TAuditLogs[]) => Promise<void>;
  drainStream: (data: TAuditLogStreamFlushJobData) => Promise<void>;
  sweepStaleClaims: () => Promise<void>;
  pruneDeliveredRows: () => Promise<void>;
  pruneDlqEntries: () => Promise<void>;
};

export const auditLogStreamOutboxServiceFactory = ({
  auditLogStreamOutboxDAL,
  auditLogStreamDAL,
  kmsService,
  keyStore,
  queueService,
  onStreamFailure
}: TAuditLogStreamOutboxServiceFactoryDep): TAuditLogStreamOutboxServiceFactory => {
  // Try to win the 5s SETNX debounce for a stream and, on win, enqueue a delayed
  // flush job on the matching per-provider queue. Returning false means another
  // writer already covered the window — there's nothing for the caller to do.
  const debounceAndEnqueueFlush = async (streamId: string, orgId: string, provider: LogProvider): Promise<boolean> => {
    const queueName = PROVIDER_QUEUE_MAP[provider];
    if (!queueName) {
      logger.warn(
        `audit-log-stream-outbox: unknown provider, skipping flush enqueue [provider=${provider}] [streamId=${streamId}]`
      );
      return false;
    }

    const debounceKey = KeyStorePrefixes.AuditLogStreamFlushDebounce(streamId);
    const acquired = await keyStore.setItemWithExpiryNX(debounceKey, FLUSH_DEBOUNCE_SECONDS, "1");
    if (!acquired) return false;

    try {
      await queueService.queue(
        queueName,
        QueueJobs.AuditLogStreamFlush,
        { streamId, orgId, provider },
        {
          jobId: `flush-${streamId}`,
          delay: FLUSH_DEBOUNCE_MS,
          removeOnComplete: true,
          removeOnFail: { count: 50 }
        }
      );
    } catch (error) {
      logger.error(
        error,
        `audit-log-stream-outbox: failed to enqueue flush job [provider=${provider}] [queue=${queueName}] [streamId=${streamId}] [orgId=${orgId}]`
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

    const outboxRows: { streamId: string; orgId: string; payload: TAuditLogs }[] = [];
    // Dedup streams touched this batch so each is debounced/woken exactly once.
    const streamsToFlush = new Map<string, { orgId: string; provider: LogProvider }>();

    // One lookup for every org in the batch instead of a query per org — the common case is
    // that most orgs have no streams configured, so a per-org loop is mostly empty round-trips.
    const streams = await auditLogStreamDAL.find({ $in: { orgId: [...logsByOrg.keys()] } });
    for (const stream of streams) {
      const logs = logsByOrg.get(stream.orgId);
      if (logs) {
        for (const log of logs) {
          outboxRows.push({ streamId: stream.id, orgId: stream.orgId, payload: log });
        }
        streamsToFlush.set(stream.id, { orgId: stream.orgId, provider: stream.provider as LogProvider });
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

    for (let batchIdx = 0; batchIdx < MAX_BATCHES_PER_JOB; batchIdx += 1) {
      // eslint-disable-next-line no-await-in-loop
      const claimed = await auditLogStreamOutboxDAL.claimBatchForStream(streamId, BATCH_SIZE);
      if (claimed.length === 0) return;

      const chunks = chunkAuditLogsByBatchLimit(claimed, providerImpl.getProviderBatchLimit());
      const streamSuccess: TAuditLogStreamOutboxRow[] = [];
      const streamFail: TFailedStreamRow[] = [];
      for (const chunk of chunks) {
        try {
          // eslint-disable-next-line no-await-in-loop
          await providerImpl.batchStreamLog({ credentials, auditLogs: chunk.map((row) => row.payload) });
          streamSuccess.push(...chunk);
        } catch (error) {
          const errorMessage = truncateError(error);
          logger.error(
            error,
            `audit-log-stream-outbox: batch delivery failed [streamId=${streamId}] [orgId=${orgId}] [provider=${provider}] [chunkSize=${chunk.length}]: ${errorMessage}`
          );
          streamFail.push(...chunk.map((row) => ({ row, errorMessage })));
        }
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

      // eslint-disable-next-line no-await-in-loop
      await auditLogStreamOutboxDAL.commitDeliveryResult({
        successIds: streamSuccess.map((row) => row.id),
        retriable: retriableInput,
        exhausted
      });

      if (streamFail.length > 0) {
        if (onStreamFailure) {
          const representativeError = streamFail.at(-1)?.errorMessage ?? "Unknown error";
          // eslint-disable-next-line no-await-in-loop
          await Promise.resolve(onStreamFailure({ orgId, streamId, provider, errorMessage: representativeError }));
        }

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
  //      re-enter the drain query — flip them back to 'retry' (or DLQ if attempts
  //      are exhausted).
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
    const { retried, movedToDlq } = await auditLogStreamOutboxDAL.recoverStaleClaims(
      STALE_CLAIM_THRESHOLD_MS,
      MAX_ATTEMPTS
    );
    if (retried > 0 || movedToDlq > 0) {
      logger.warn(
        `audit-log-stream-outbox: recovered stale claims [retried=${retried}] [movedToDlq=${movedToDlq}] [thresholdMs=${STALE_CLAIM_THRESHOLD_MS}]`
      );
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

  const pruneDlqEntries = async () => {
    const deleted = await auditLogStreamOutboxDAL.deleteDlqOlderThan(DLQ_RETENTION_MS);
    if (deleted > 0) {
      logger.info(`audit-log-stream-outbox: pruned dlq entries [deleted=${deleted}] [retentionMs=${DLQ_RETENTION_MS}]`);
    }
  };

  return {
    enqueueForLogs,
    drainStream,
    sweepStaleClaims,
    pruneDeliveredRows,
    pruneDlqEntries
  };
};
