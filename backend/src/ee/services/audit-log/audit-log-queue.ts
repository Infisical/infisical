import type { ClickHouseClient } from "@clickhouse/client";
import { randomUUID } from "crypto";
import { v7 as uuidv7 } from "uuid";

import type { TAuditLogs, TProjects } from "@app/db/schemas";
import { TAuditLogStreamServiceFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-service";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { requestMemoKeys } from "@app/lib/request-context/memo-keys";
import { requestMemoize } from "@app/lib/request-context/request-memoizer";
import { JOB_SCHEDULER_PREFIX, QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TAuditLogDALFactory } from "./audit-log-dal";
import { TCreateAuditLogDTO } from "./audit-log-types";

type TAuditLogQueueServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  auditLogStreamService: Pick<TAuditLogStreamServiceFactory, "streamLog">;
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

export const AUDIT_LOG_STREAM_TIMEOUT = 5 * 1000;
const MS_IN_DAY = 24 * 60 * 60 * 1000;
const AUDIT_LOG_STREAM_KEY = "audit-log-stream";
const AUDIT_LOG_BATCH_SIZE = 10_000;
const AUDIT_LOG_MAX_ENTRIES = 50_000;
const AUDIT_LOG_BATCH_LOCK_TIMEOUT = 60 * 1000;

export const auditLogQueueServiceFactory = async ({
  auditLogDAL,
  queueService,
  projectDAL,
  licenseService,
  auditLogStreamService,
  clickhouseClient,
  keyStore
}: TAuditLogQueueServiceFactoryDep): Promise<TAuditLogQueueServiceFactory> => {
  const { CLICKHOUSE_AUDIT_LOG_ENABLED, CLICKHOUSE_AUDIT_LOG_TABLE_NAME, CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS } =
    getConfig();

  const isClickHouseBatchEnabled = Boolean(clickhouseClient && CLICKHOUSE_AUDIT_LOG_ENABLED);

  const pushToLog = async (data: TCreateAuditLogDTO) => {
    try {
      const { actor, event, ipAddress, projectId, userAgent, userAgentType } = data;
      let { orgId } = data;
      if (!orgId && !projectId) {
        logger.error(
          `audit-log-queue: Received audit log with neither orgId nor projectId, skipping [event=${event?.type}]`
        );
        return;
      }

      let project: TProjects | undefined;
      if (!orgId) {
        project =
          (await requestMemoize(requestMemoKeys.projectFindById(projectId!), () => projectDAL.findById(projectId!))) ??
          undefined;
        if (!project) {
          logger.error(
            `audit-log-queue: project was deleted, skipping [projectId=${projectId}] [event=${event?.type}]`
          );
          return;
        }
        orgId = project.orgId;
      }

      const plan = await licenseService.getPlan(orgId);

      // skip inserting if audit log retention is 0 meaning its not supported
      if (!plan.auditLogsRetentionDays) return;

      // For project actions, set TTL to project-level audit log retention config
      // This condition ensures that the plan's audit log retention days cannot be bypassed
      const ttlInDays =
        project?.auditLogsRetentionDays && project.auditLogsRetentionDays < plan.auditLogsRetentionDays
          ? project.auditLogsRetentionDays
          : plan.auditLogsRetentionDays;

      const ttl = ttlInDays * MS_IN_DAY;
      const createdAt = new Date();
      const eventMetadata = normalizeJsonPayload(event.metadata);
      const actorMetadata = normalizeJsonPayload(actor.metadata);

      // UUIDv7 embeds createdAt so the id's time matches createdAt for ClickHouse
      // UUIDv4 for Postgres (existing schema expectation)
      const id = isClickHouseBatchEnabled ? uuidv7({ msecs: createdAt.getTime() }) : randomUUID();
      const auditLog = {
        id,
        actor: actor.type,
        actorMetadata,
        ipAddress: normalizeEmptyValue(ipAddress, isClickHouseBatchEnabled),
        eventType: event.type,
        eventMetadata,
        userAgent: normalizeEmptyValue(userAgent, isClickHouseBatchEnabled),
        userAgentType: normalizeEmptyValue(userAgentType, isClickHouseBatchEnabled),
        projectId: normalizeEmptyValue(projectId, isClickHouseBatchEnabled),
        orgId,
        expiresAt: new Date(createdAt.getTime() + ttl),
        createdAt,
        updatedAt: createdAt,
        // project name is only used for non-ClickHouse insertion
        ...(!isClickHouseBatchEnabled ? { projectName: project?.name } : {})
      };

      await keyStore.streamAdd(AUDIT_LOG_STREAM_KEY, "*", { data: JSON.stringify(auditLog) });
    } catch (error) {
      // Best-effort: never let audit logging break the calling request
      logger.error(
        error,
        `audit-log-queue: Failed to push audit log to stream [event=${data.event?.type}] [orgId=${data.orgId}] [projectId=${data.projectId}]`
      );
    }
  };

  // Batch consumer: drains the Redis stream every 5s and bulk-inserts into ClickHouse (when enabled) or Postgres.
  queueService.start(QueueName.AuditLogBatch, async () => {
    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;
    try {
      lock = await keyStore.acquireLock([KeyStorePrefixes.AuditLogBatchLock], AUDIT_LOG_BATCH_LOCK_TIMEOUT, {
        retryCount: 0
      });
    } catch {
      return;
    }

    try {
      const { entries, lastId } = await keyStore.streamCollect(
        AUDIT_LOG_STREAM_KEY,
        AUDIT_LOG_BATCH_SIZE,
        AUDIT_LOG_MAX_ENTRIES
      );

      if (entries.length === 0 || !lastId) return;

      // JSON.stringify serializes Date as ISO strings, so the on-wire shape uses strings.
      type TStreamedAuditLog = Omit<TAuditLogs, "createdAt" | "updatedAt" | "expiresAt"> & {
        createdAt: string;
        updatedAt: string;
        expiresAt?: string | null;
      };

      const values = entries.map(([, fields]) => JSON.parse(fields[1]) as TStreamedAuditLog);

      const hydrate = (v: TStreamedAuditLog): TAuditLogs => ({
        ...v,
        createdAt: new Date(v.createdAt),
        updatedAt: new Date(v.updatedAt),
        expiresAt: v.expiresAt ? new Date(v.expiresAt) : null
      });

      try {
        if (isClickHouseBatchEnabled) {
          await clickhouseClient!.insert({
            table: CLICKHOUSE_AUDIT_LOG_TABLE_NAME,
            clickhouse_settings: CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS,
            values,
            format: "JSONEachRow"
          });
        } else {
          // Chunks execute inside a single transaction so the Redis stream can be
          // acknowledged only after the entire drain commits successfully.
          //
          // This preserves atomicity between stream consumption and Postgres persistence:
          // either every audit log in the drain is persisted, or the consumer replays
          // the full batch on the next run via ON CONFLICT DO NOTHING idempotency.
          await auditLogDAL.bulkInsertIgnoreConflicts(values.map(hydrate));
        }

        // Only trim after successful insert; on crash between insert and trim,
        // ClickHouse async_insert dedup + Postgres ON CONFLICT make replay idempotent.
        await keyStore.streamTrim(AUDIT_LOG_STREAM_KEY, lastId, true);

        logger.info(
          { count: values.length, backend: isClickHouseBatchEnabled ? "clickhouse" : "postgres" },
          "audit-log-queue: Batch inserted audit logs"
        );

        // Forward to external streams (Datadog/Splunk/etc) post-persist, fire-and-forget
        if (getConfig().AUDIT_LOG_STREAMS_ENABLED) {
          setImmediate(() => {
            void Promise.allSettled(
              values
                .filter((v): v is TStreamedAuditLog & { orgId: string } => Boolean(v.orgId))
                .map((v) => auditLogStreamService.streamLog(v.orgId, hydrate(v)))
            );
          });
        }
      } catch (error) {
        logger.error(error, `audit-log-queue: Failed to batch insert ${values.length} audit logs`);
      }
    } finally {
      await lock.release();
    }
  });

  await queueService.upsertJobScheduler(
    QueueName.AuditLogBatch,
    `${JOB_SCHEDULER_PREFIX}:audit-log-batch`,
    { every: 5000 },
    { name: QueueJobs.AuditLogBatch }
  );

  return {
    pushToLog
  };
};
