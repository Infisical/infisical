import type { ClickHouseClient } from "@clickhouse/client";
import { randomUUID } from "crypto";
import { v7 as uuidv7 } from "uuid";

import type { TAuditLogs, TProjects } from "@app/db/schemas";
import { TAuditLogStreamOutboxServiceFactory } from "@app/ee/services/audit-log-stream-outbox/audit-log-stream-outbox-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
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
  keyStore: Pick<TKeyStoreFactory, "streamAdd" | "streamCollect" | "streamTrim">;
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

// Redis ingest stream shared by both storage backends. `pushToLog` appends raw-ish entries
// here; a single scheduled consumer drains, enriches, batch-inserts, fans out to the outbox,
// and trims. Keep the key literal stable so a rolling deploy doesn't strand in-flight entries.
const AUDIT_LOG_STREAM_KEY = "audit-log-stream";
const AUDIT_LOG_STREAM_BATCH_SIZE = 10_000;
const AUDIT_LOG_STREAM_MAX_ENTRIES = 50_000;

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

  // Append the log to the Redis ingest stream. We pin `id` and `createdAt` here so a consumer
  // retry (reprocessing the same batch after a failed insert) re-inserts byte-identical rows
  // instead of regenerating ids. UUIDv7 embeds the timestamp for ClickHouse's time-sorted id;
  // UUIDv4 keeps the existing Postgres schema expectation.
  const appendToIngestStream = async (data: TCreateAuditLogDTO) => {
    const createdAt = new Date();
    const id = isClickHouseBatchEnabled ? uuidv7({ msecs: createdAt.getTime() }) : randomUUID();
    const entry: TAuditLogStreamEntry = { ...data, id, createdAt: createdAt.toISOString() };
    await keyStore.streamAdd(AUDIT_LOG_STREAM_KEY, "*", { data: JSON.stringify(entry) });
  };

  // Request-path push: a transient Redis failure must not fail the request that produced
  // the audit event, so errors are logged and swallowed (at-most-once on this path).
  const pushToLog = async (data: TCreateAuditLogDTO) => {
    try {
      await appendToIngestStream(data);
    } catch (error) {
      logger.error(
        error,
        `audit-log-queue: Failed to push audit log to ingest stream [event=${data.event?.type}] [orgId=${data.orgId}] [projectId=${data.projectId}]`
      );
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

  // Unified consumer: drain a batch from the ingest stream, enrich each entry, batch-insert
  // into the active backend, fan out to the stream outbox, and trim. Trim happens only after a
  // successful insert so a failed batch is retried on the next tick (re-inserts are idempotent:
  // ClickHouse ReplacingMergeTree dedups on id, Postgres uses ON CONFLICT (id) DO NOTHING).
  const consumeAuditLogStream = async () => {
    const { entries, lastId } = await keyStore.streamCollect(
      AUDIT_LOG_STREAM_KEY,
      AUDIT_LOG_STREAM_BATCH_SIZE,
      AUDIT_LOG_STREAM_MAX_ENTRIES
    );

    if (entries.length === 0 || !lastId) return;

    // Parse — a single corrupt entry is skipped, not allowed to abort the whole batch.
    const parsed: TAuditLogStreamEntry[] = [];
    for (const [, fields] of entries) {
      try {
        parsed.push(JSON.parse(fields[1]) as TAuditLogStreamEntry);
      } catch (error) {
        logger.error(error, "audit-log-queue: Skipping unparseable audit log stream entry");
      }
    }

    // Resolve projects for entries that arrived without an orgId (deduped by projectId). A
    // lookup that returns nothing means the project was deleted → drop that entry; a lookup
    // that throws bubbles up to fail the tick (no trim → retry) so a transient DB error
    // doesn't silently lose logs.
    const projectCache = new Map<string, TProjects | undefined>();
    const distinctProjectIds = [
      ...new Set(parsed.filter((entry) => !entry.orgId && entry.projectId).map((entry) => entry.projectId as string))
    ];
    for (const projectId of distinctProjectIds) {
      // eslint-disable-next-line no-await-in-loop
      projectCache.set(projectId, await projectDAL.findById(projectId));
    }

    const resolveOrgId = (entry: TAuditLogStreamEntry): string | undefined =>
      entry.orgId ?? (entry.projectId ? projectCache.get(entry.projectId)?.orgId : undefined);

    // Resolve license plans (deduped by orgId) — drives the audit-log retention check + TTL.
    const planCache = new Map<string, Awaited<ReturnType<typeof licenseService.getPlan>>>();
    const distinctOrgIds = new Set<string>();
    for (const entry of parsed) {
      const orgId = resolveOrgId(entry);
      if (orgId) distinctOrgIds.add(orgId);
    }
    for (const orgId of distinctOrgIds) {
      // eslint-disable-next-line no-await-in-loop
      planCache.set(orgId, await licenseService.getPlan(orgId));
    }

    // Enrich one entry into a persistable audit log, or return null to drop it (skip rules
    // mirror the prior per-log worker). Only org-less (project-scoped) entries carry project
    // context — a directly-supplied orgId skips the project lookup entirely, as before.
    const enrichEntry = (entry: TAuditLogStreamEntry): TAuditLogs | null => {
      const { projectId } = entry;

      if (!entry.orgId && !projectId) {
        logger.error(`audit-log-queue: Skipping entry with neither orgId nor projectId [event=${entry.event?.type}]`);
        return null;
      }

      const project = !entry.orgId && projectId ? projectCache.get(projectId) : undefined;
      if (!entry.orgId && projectId && !project) {
        logger.error(
          `audit-log-queue: Skipping entry, project was deleted [projectId=${projectId}] [event=${entry.event?.type}]`
        );
        return null;
      }

      const orgId = entry.orgId ?? project?.orgId;
      if (!orgId) return null;

      const plan = planCache.get(orgId);
      // Skip inserting if audit log retention is 0/unset, meaning it's not supported.
      if (!plan?.auditLogsRetentionDays) return null;

      // For project actions, cap TTL at the project-level retention so the plan's retention
      // days cannot be bypassed upward.
      const ttlInDays =
        project?.auditLogsRetentionDays && project.auditLogsRetentionDays < plan.auditLogsRetentionDays
          ? project.auditLogsRetentionDays
          : plan.auditLogsRetentionDays;
      const ttl = ttlInDays * MS_IN_DAY;

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
        projectId: normalizeEmptyValue(projectId, isClickHouseBatchEnabled),
        orgId,
        expiresAt: new Date(createdAt.getTime() + ttl),
        createdAt,
        updatedAt: createdAt,
        // project name is only stored for non-ClickHouse insertion
        ...(!isClickHouseBatchEnabled ? { projectName: project?.name } : {})
      };
    };

    const enriched = parsed.map(enrichEntry).filter((log): log is TAuditLogs => log !== null);

    if (enriched.length > 0) {
      try {
        await insertBatch(enriched);
      } catch (error) {
        logger.error(
          error,
          `audit-log-queue: Failed to batch insert ${enriched.length} audit logs [backend=${
            isClickHouseBatchEnabled ? "clickhouse" : "postgres"
          }]`
        );
        // Do not trim — the same entries are reprocessed next tick (re-insert is idempotent).
        return;
      }

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
          backend: isClickHouseBatchEnabled ? "clickhouse" : "postgres"
        },
        "audit-log-queue: Batch processed audit logs"
      );
    }

    // Trim whenever the insert step did not throw — including the all-dropped case — so skipped
    // and handled entries don't accumulate in the stream forever.
    await keyStore.streamTrim(AUDIT_LOG_STREAM_KEY, lastId, true);
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
