import type { ClickHouseClient } from "@clickhouse/client";
import { randomUUID } from "crypto";
import { v7 as uuidv7 } from "uuid";

import type { TAuditLogs } from "@app/db/schemas";
import { TAuditLogStreamOutboxServiceFactory } from "@app/ee/services/audit-log-stream-outbox/audit-log-stream-outbox-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import {
  auditLogDroppedCounter,
  auditLogEnqueuedCounter,
  auditLogPersistDurationHistogram
} from "@app/lib/telemetry/metrics";
import { JOB_SCHEDULER_PREFIX, QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TAuditLogDALFactory } from "./audit-log-dal";
import { TAuditLogStreamEntry, TCreateAuditLogDTO } from "./audit-log-types";

type TAuditLogQueueServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  auditLogStreamOutboxService: Pick<TAuditLogStreamOutboxServiceFactory, "enqueueForLogs">;
  queueService: TQueueServiceFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
  clickhouseClient: ClickHouseClient | null;
  keyStore: Pick<TKeyStoreFactory, "streamAdd" | "streamCollect" | "streamTrim" | "acquireLock">;
};

export type TAuditLogQueueServiceFactory = {
  pushToLog: (data: TCreateAuditLogDTO) => Promise<void>;
};

const normalizeJsonPayload = (payload: unknown) => {
  if (Array.isArray(payload)) {
    return { data: payload };
  }
  if (typeof payload === "object" && payload !== null) {
    return payload;
  }
  logger.error({ payload }, "audit-log-queue: Unexpected audit log payload type, expected object or array");
  return {};
};

const normalizeEmptyValue = (value: string | undefined | null, isClickhouse: boolean) => {
  if (!value) {
    return isClickhouse ? "" : null;
  }
  return value;
};

// keep this timeout 5s it must be fast because else the queue will take time to finish
// audit log is a crowded queue thus needs to be fast
export const AUDIT_LOG_STREAM_TIMEOUT = 5 * 1000;

// batch deliveries can carry up to AUDIT_LOG_STREAM_BATCH_SIZE events to remote intakes;
// give them more headroom than the single-event ping timeout above.
export const AUDIT_LOG_STREAM_BATCH_TIMEOUT = 30 * 1000;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const AUDIT_LOG_STREAM_KEY = "audit-log-stream";
const AUDIT_LOG_STREAM_BATCH_SIZE = 10_000;
const AUDIT_LOG_STREAM_MAX_ENTRIES = 50_000;
const AUDIT_LOG_STREAM_CONSUMER_LOCK_TTL_MS = 60_000;

export const auditLogQueueServiceFactory = async ({
  auditLogDAL,
  queueService,
  projectDAL,
  licenseService,
  auditLogStreamOutboxService,
  clickhouseClient,
  keyStore
}: TAuditLogQueueServiceFactoryDep): Promise<TAuditLogQueueServiceFactory> => {
  const { CLICKHOUSE_AUDIT_LOG_ENABLED, CLICKHOUSE_AUDIT_LOG_TABLE_NAME, CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS } =
    getConfig();

  const isClickHouseBatchEnabled = Boolean(clickhouseClient && CLICKHOUSE_AUDIT_LOG_ENABLED);

  const buildStreamEntry = async (data: TCreateAuditLogDTO): Promise<TAuditLogStreamEntry | null> => {
    const { projectId } = data;

    if (!data.orgId && !projectId) {
      logger.error(`audit-log-queue: Skipping entry with neither orgId nor projectId [event=${data.event?.type}]`);
      return null;
    }

    const project =
      !data.orgId && projectId
        ? await requestMemoize(requestMemoKeys.projectFindById(projectId), () => projectDAL.findById(projectId))
        : undefined;
    if (!data.orgId && projectId && !project) {
      logger.error(
        `audit-log-queue: Skipping entry, project was deleted [projectId=${projectId}] [event=${data.event?.type}]`
      );
      return null;
    }

    const orgId = data.orgId ?? project?.orgId;
    if (!orgId) return null;

    const plan = await licenseService.getPlan(orgId);
    if (!plan?.auditLogsRetentionDays) return null;

    const ttlInDays =
      project?.auditLogsRetentionDays && project.auditLogsRetentionDays < plan.auditLogsRetentionDays
        ? project.auditLogsRetentionDays
        : plan.auditLogsRetentionDays;
    const ttl = ttlInDays * MS_IN_DAY;

    const createdAt = new Date();
    const id = isClickHouseBatchEnabled ? uuidv7({ msecs: createdAt.getTime() }) : randomUUID();

    return {
      ...data,
      id,
      orgId,
      createdAt: createdAt.toISOString(),
      expiresAt: new Date(createdAt.getTime() + ttl).toISOString(),
      projectName: project?.name
    };
  };

  // Append the resolved log to the Redis ingest stream. A dropped (null) entry is a no-op.
  const appendToIngestStream = async (data: TCreateAuditLogDTO) => {
    const entry = await buildStreamEntry(data);
    if (!entry) return;
    await keyStore.streamAdd(AUDIT_LOG_STREAM_KEY, "*", { data: JSON.stringify(entry) });
    auditLogEnqueuedCounter.add(1, {
      "audit_log.event_type": entry.event?.type ?? "unknown",
      "audit_log.actor_type": entry.actor?.type ?? "unknown",
      "infisical.organization.id": entry.orgId
    });
  };

  // Request-path push: a transient Redis/DB failure must not fail the request that produced
  // the audit event, so errors (resolution lookups included) are logged and swallowed
  // (at-most-once on this path).
  const pushToLog = async (data: TCreateAuditLogDTO) => {
    try {
      await appendToIngestStream(data);
    } catch (error) {
      // At-most-once on the request path: the produced event is now lost (not retried). Log it
      // as an explicit drop so it's searchable as audit-log data loss, not a generic push failure.
      logger.error(
        error,
        `audit-log-queue: Dropped audit log — failed to push to ingest stream (at-most-once on request path) [event=${data.event?.type}] [orgId=${data.orgId}] [projectId=${data.projectId}]`
      );
      auditLogDroppedCounter.add(1, {
        "audit_log.event_type": data.event?.type ?? "unknown",
        "audit_log.actor_type": data.actor?.type ?? "unknown",
        "audit_log.drop_reason": "ingest_stream_push_failed",
        ...(data.orgId ? { "infisical.organization.id": data.orgId } : {})
      });
    }
  };

  // Compatibility shim: legacy per-log AuditLog jobs enqueued by old pods (before the
  // stream rollout) get re-routed into the unified stream so a rolling deploy doesn't
  // strand them with no consumer. Unlike the request path we re-throw on stream-add
  // failure so BullMQ retries the job instead of dropping it.
  // TODO: remove next release once the legacy QueueName.AuditLog queue has drained.
  queueService.start(QueueName.AuditLog, async (job) => {
    if (!job.data) return;
    await appendToIngestStream(job.data);
  });

  const insertBatch = async (logs: TAuditLogs[]) => {
    if (isClickHouseBatchEnabled) {
      await clickhouseClient!.insert({
        table: CLICKHOUSE_AUDIT_LOG_TABLE_NAME,
        clickhouse_settings: CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS,
        values: logs,
        format: "JSONEachRow"
      });
    } else {
      await auditLogDAL.batchCreate(logs);
    }
  };

  // Unified consumer: drain a batch from the ingest stream, map each (already-resolved) entry to
  // an audit-log row, batch-insert into the active backend, fan out to the stream outbox, and
  // trim. No DB lookups happen here — org/plan/retention were resolved at push time. Trim happens only after a
  // successful insert so a failed batch is retried on the next tick (re-inserts are idempotent:
  // ClickHouse ReplacingMergeTree dedups on id, Postgres uses ON CONFLICT (id) DO NOTHING).
  const drainAuditLogStream = async () => {
    const { entries, lastId } = await keyStore.streamCollect(
      AUDIT_LOG_STREAM_KEY,
      AUDIT_LOG_STREAM_BATCH_SIZE,
      AUDIT_LOG_STREAM_MAX_ENTRIES
    );

    if (entries.length === 0 || !lastId) return;

    if (entries.length >= AUDIT_LOG_STREAM_MAX_ENTRIES) {
      logger.warn(
        `audit-log-queue: ingest stream backlog hit the collection ceiling [collected=${entries.length}] [maxEntries=${AUDIT_LOG_STREAM_MAX_ENTRIES}] — stream is backing up; oldest entries risk being dropped by the Redis MAXLEN cap`
      );
    }

    // Parse — a single corrupt entry is skipped, not allowed to abort the whole batch.
    const parsed: unknown[] = [];
    for (const [, fields] of entries) {
      try {
        parsed.push(JSON.parse(fields[1]));
      } catch (error) {
        logger.error(error, "audit-log-queue: Skipping unparseable audit log stream entry");
      }
    }

    // A pre-rollout pod (before this stream format shipped) wrote the already-mapped
    // audit-log row to the ingest stream, not the resolved DTO. Those legacy entries are
    // flat (`actor`/`eventType` are strings, there is no nested `event` object)
    type TLegacyAuditLogStreamEntry = Omit<TAuditLogs, "createdAt" | "expiresAt" | "updatedAt"> & {
      createdAt: string;
      expiresAt: string;
    };
    const isCurrentShape = (raw: Record<string, unknown>): boolean =>
      typeof raw.event === "object" && raw.event !== null;

    // Map a stream entry into a persistable audit log. org/plan/TTL/projectName were all
    // resolved at push time (see buildStreamEntry), so this is a pure shape transform with no DB
    // lookups. Entries that predate push-time resolution (in-flight during a rolling deploy) lack
    // `orgId`/`expiresAt`; drop them rather than persist a row with a missing org or expiry.
    const enrichEntry = (raw: unknown): TAuditLogs | null => {
      if (typeof raw !== "object" || raw === null) {
        logger.error("audit-log-queue: Skipping non-object audit log stream entry");
        return null;
      }

      // Legacy flat entry: it is already in the persisted shape (mapped + normalized by the
      // old pod), so only the timestamps need re-hydrating from their JSON ISO strings.
      if (!isCurrentShape(raw as Record<string, unknown>)) {
        const legacy = raw as TLegacyAuditLogStreamEntry;
        if (!legacy.orgId || !legacy.expiresAt) {
          logger.error(
            `audit-log-queue: Skipping legacy entry missing resolved metadata [eventType=${legacy.eventType}] [orgId=${legacy.orgId}]`
          );
          return null;
        }
        const legacyCreatedAt = new Date(legacy.createdAt);
        return {
          ...legacy,
          expiresAt: new Date(legacy.expiresAt),
          createdAt: legacyCreatedAt,
          updatedAt: legacyCreatedAt
        };
      }

      const entry = raw as TAuditLogStreamEntry;
      if (!entry.orgId || !entry.expiresAt) {
        logger.error(
          `audit-log-queue: Skipping entry missing resolved metadata [event=${entry.event?.type}] [orgId=${entry.orgId}]`
        );
        return null;
      }

      const createdAt = new Date(entry.createdAt);
      return {
        id: entry.id,
        actor: entry.actor.type,
        actorMetadata: normalizeJsonPayload(entry.actor.metadata),
        ipAddress: normalizeEmptyValue(entry.ipAddress, isClickHouseBatchEnabled),
        eventType: entry.event.type,
        eventMetadata: normalizeJsonPayload(entry.event.metadata),
        userAgent: normalizeEmptyValue(entry.userAgent, isClickHouseBatchEnabled),
        userAgentType: normalizeEmptyValue(entry.userAgentType, isClickHouseBatchEnabled),
        projectId: normalizeEmptyValue(entry.projectId, isClickHouseBatchEnabled),
        orgId: entry.orgId,
        expiresAt: new Date(entry.expiresAt),
        createdAt,
        updatedAt: createdAt,
        // project name is only stored for non-ClickHouse insertion
        ...(!isClickHouseBatchEnabled ? { projectName: entry.projectName } : {})
      };
    };

    // Per-entry guard: a single unmappable entry (corrupt or unexpected shape) is skipped,
    // never allowed to throw out of the map and abort the whole batch
    const enriched: TAuditLogs[] = [];
    for (const raw of parsed) {
      try {
        const log = enrichEntry(raw);
        if (log) enriched.push(log);
      } catch (error) {
        logger.error(error, "audit-log-queue: Skipping unmappable audit log stream entry");
      }
    }

    const backend = isClickHouseBatchEnabled ? "clickhouse" : "postgres";

    if (enriched.length > 0) {
      const persistStart = Date.now();
      try {
        await insertBatch(enriched);
      } catch (error) {
        auditLogPersistDurationHistogram.record((Date.now() - persistStart) / 1000, {
          "audit_log.backend": backend,
          outcome: "failure"
        });
        logger.error(
          error,
          `audit-log-queue: Failed to batch insert ${enriched.length} audit logs [backend=${backend}]`
        );
        // Do not trim — the same entries are reprocessed next tick (re-insert is idempotent).
        return;
      }
      auditLogPersistDurationHistogram.record((Date.now() - persistStart) / 1000, {
        "audit_log.backend": backend,
        outcome: "success"
      });

      if (getConfig().AUDIT_LOG_STREAMS_ENABLED) {
        try {
          await auditLogStreamOutboxService.enqueueForLogs(enriched);
        } catch (error) {
          logger.error(
            error,
            "audit-log-queue: Failed to enqueue audit logs to stream outbox; skipping trim so the batch is reprocessed"
          );
          return;
        }
      }

      logger.info(
        {
          inserted: enriched.length,
          dropped: parsed.length - enriched.length,
          backend
        },
        "audit-log-queue: Batch processed audit logs"
      );
    }

    // Trim whenever the insert step did not throw — including the all-dropped case — so skipped
    // and handled entries don't accumulate in the stream forever.
    await keyStore.streamTrim(AUDIT_LOG_STREAM_KEY, lastId, true);
  };

  // Cron fires every 5 s but a tick can run longer under load (big batch, slow DB). Multiple
  // pods all subscribe to the scheduler so two ticks can overlap. The work is idempotent, but
  // overlap doubles DB / Redis pressure when we're already behind. Guard the body with redlock
  // (`retryCount: 0` makes it non-blocking): if another runner holds the lock we just skip —
  // the next scheduled tick will pick up where it left off. The TTL is a safety net for a
  // crashed consumer; release uses a fencing-token Lua script so a slow runner whose lock
  // already expired can't accidentally release a successor's lock.
  const consumeAuditLogStream = async () => {
    let lock;
    try {
      lock = await keyStore.acquireLock(
        [KeyStorePrefixes.AuditLogIngestConsumerLock],
        AUDIT_LOG_STREAM_CONSUMER_LOCK_TTL_MS,
        {
          retryCount: 0
        }
      );
    } catch {
      // Another runner holds the lock — skip this tick.
      return;
    }
    try {
      await drainAuditLogStream();
    } finally {
      await lock.release();
    }
  };

  // Single scheduled consumer for both backends, every 5 seconds. Registered unconditionally
  // now that Postgres also batches through the stream. The scheduler id is kept as the historical
  // "audit-log-clickhouse-batch" so the existing Redis scheduler key isn't orphaned on upgrade.
  queueService.start(QueueName.AuditLogClickHouseBatch, consumeAuditLogStream);

  await queueService.upsertJobScheduler(
    QueueName.AuditLogClickHouseBatch,
    `${JOB_SCHEDULER_PREFIX}:audit-log-clickhouse-batch`,
    { every: 5000 },
    { name: QueueJobs.AuditLogClickHouseBatch }
  );

  return {
    pushToLog
  };
};
