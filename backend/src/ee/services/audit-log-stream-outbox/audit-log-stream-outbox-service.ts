import { isAxiosError } from "axios";
import { randomUUID } from "crypto";

import { TAuditLogs } from "@app/db/schemas";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TKmsServiceFactory } from "@app/services/kms/kms-service";

import { TAuditLogStreamDALFactory } from "../audit-log-stream/audit-log-stream-dal";
import { LogProvider } from "../audit-log-stream/audit-log-stream-enums";
import { LOG_STREAM_FACTORY_MAP } from "../audit-log-stream/audit-log-stream-factory";
import { decryptLogStreamCredentials } from "../audit-log-stream/audit-log-stream-fns";
import { TAuditLogStreamOutboxDALFactory } from "./audit-log-stream-outbox-dal";
import { TAuditLogStreamFlushJobData, TAuditLogStreamOutboxRow } from "./audit-log-stream-outbox-types";

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

const PROVIDER_QUEUE_MAP: Record<LogProvider, QueueName> = {
  [LogProvider.Azure]: QueueName.AuditLogStreamAzure,
  [LogProvider.Cribl]: QueueName.AuditLogStreamCribl,
  [LogProvider.Custom]: QueueName.AuditLogStreamCustom,
  [LogProvider.Datadog]: QueueName.AuditLogStreamDatadog,
  [LogProvider.Splunk]: QueueName.AuditLogStreamSplunk
};

const LAST_ERROR_MAX_LENGTH = 1_000;

const computeBackoff = (attemptsAfterIncrement: number): Date => {
  const exponent = Math.min(attemptsAfterIncrement - 1, 10);
  const base = Math.min(BACKOFF_BASE_MS * 2 ** exponent, BACKOFF_MAX_MS);
  const jitter = Math.floor(Math.random() * Math.min(base / 2, 30_000));
  return new Date(Date.now() + base + jitter);
};

const truncateError = (error: unknown): string => {
  let message: string;
  if (isAxiosError(error)) {
    message = `${error.message ?? "Request failed"} — ${JSON.stringify(error.response?.data ?? null)}`;
  } else {
    message = (error as Error)?.message ?? "Unknown error";
  }
  if (message.length > LAST_ERROR_MAX_LENGTH) {
    return `${message.slice(0, LAST_ERROR_MAX_LENGTH)}...`;
  }
  return message;
};

const formatErrorMessage = (error: unknown): string => {
  if (isAxiosError(error)) {
    return `${error.message ?? "Request failed"} — ${JSON.stringify(error.response?.data ?? null)}`;
  }
  return (error as Error)?.message ?? "Unknown error";
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

    // Job ID matches the debounce key so BullMQ collapses any in-flight duplicates.
    await queueService.queue(
      queueName,
      QueueJobs.AuditLogStreamFlush,
      { streamId, orgId, provider },
      {
        jobId: `flush:${streamId}`,
        delay: FLUSH_DEBOUNCE_MS,
        removeOnComplete: true,
        removeOnFail: { count: 50 }
      }
    );
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

    for (const [orgId, logs] of logsByOrg) {
      // eslint-disable-next-line no-await-in-loop
      const streams = await auditLogStreamDAL.find({ orgId });
      for (const stream of streams) {
        for (const log of logs) {
          outboxRows.push({ streamId: stream.id, orgId, payload: log });
        }
        streamsToFlush.set(stream.id, { orgId, provider: stream.provider as LogProvider });
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

    const workerId = randomUUID();
    const providerImpl = factory();

    for (let batchIdx = 0; batchIdx < MAX_BATCHES_PER_JOB; batchIdx += 1) {
      // eslint-disable-next-line no-await-in-loop
      const claimed = await auditLogStreamOutboxDAL.claimBatchForStream(streamId, BATCH_SIZE, workerId);
      if (claimed.length === 0) return;

      const auditLogs = claimed.map((row) => row.payload);
      try {
        // eslint-disable-next-line no-await-in-loop
        await providerImpl.batchStreamLog({ credentials, auditLogs });
        // eslint-disable-next-line no-await-in-loop
        await auditLogStreamOutboxDAL.deleteByIds(claimed.map((row) => row.id));
      } catch (error) {
        const errorMessage = truncateError(error);
        const logMessage = formatErrorMessage(error);
        logger.error(
          error,
          `audit-log-stream-outbox: batch delivery failed [streamId=${streamId}] [orgId=${orgId}] [provider=${provider}] [batchSize=${claimed.length}]: ${logMessage}`
        );

        const exhausted: TAuditLogStreamOutboxRow[] = [];
        const retriable: TAuditLogStreamOutboxRow[] = [];
        for (const row of claimed) {
          if (row.attempts + 1 >= MAX_ATTEMPTS) {
            exhausted.push(row);
          } else {
            retriable.push(row);
          }
        }

        const retriableInput = retriable.length
          ? {
              ids: retriable.map((row) => row.id),
              nextRetryAt: computeBackoff(Math.max(...retriable.map((row) => row.attempts + 1)))
            }
          : null;
        // eslint-disable-next-line no-await-in-loop
        await auditLogStreamOutboxDAL.applyBatchFailure({
          retriable: retriableInput,
          exhausted,
          errorMessage
        });

        if (onStreamFailure) {
          // eslint-disable-next-line no-await-in-loop
          await Promise.resolve(onStreamFailure({ orgId, streamId, provider, errorMessage }));
        }

        // Stop draining on the first failure — let backoff govern the retry cadence
        // instead of hammering a failing endpoint with the next batch.
        return;
      }
    }
  };

  // Stale-claim sweeper. Rows whose worker crashed mid-batch stay 'processing'
  // forever and never re-enter the drain query. Flip them back to 'retry' so
  // the next event for that stream picks them up via the normal debounce path.
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
  };

  return {
    enqueueForLogs,
    drainStream,
    sweepStaleClaims
  };
};
