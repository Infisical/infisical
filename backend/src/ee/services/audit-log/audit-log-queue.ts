import type { ClickHouseClient } from "@clickhouse/client";
import { randomUUID } from "crypto";
import { v7 as uuidv7 } from "uuid";

import type { TProjects } from "@app/db/schemas";
import { TAuditLogStreamServiceFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
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
  logger.error({ payload }, "Unexpected audit log payload type, expected object or array");
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
const MS_IN_DAY = 24 * 60 * 60 * 1000;
const AUDIT_LOG_CLICKHOUSE_STREAM_KEY = "audit-log-stream";
const AUDIT_LOG_CLICKHOUSE_BATCH_SIZE = 10_000;
const AUDIT_LOG_CLICKHOUSE_MAX_ENTRIES = 50_000;

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
    await queueService.queue<QueueName.AuditLog>(QueueName.AuditLog, QueueJobs.AuditLog, data, {
      removeOnFail: {
        count: 3
      },
      removeOnComplete: true,
      jobId: randomUUID()
    });
  };

  queueService.start(QueueName.AuditLog, async (job) => {
    const { actor, event, ipAddress, projectId, userAgent, userAgentType } = job.data;
    let { orgId } = job.data;
    let project: TProjects | undefined;

    if (!orgId) {
      // it will never be undefined for both org and project id
      // TODO(akhilmhdh): use caching here in dal to avoid db calls
      project = await projectDAL.findById(projectId as string);
      orgId = project.orgId;
    }

    const plan = await licenseService.getPlan(orgId);

    // skip inserting if audit log retention is 0 meaning its not supported
    if (plan.auditLogsRetentionDays !== 0) {
      // For project actions, set TTL to project-level audit log retention config
      // This condition ensures that the plan's audit log retention days cannot be bypassed

      // Validate plan-level retention: must be a finite number and not zero (zero disables audit logs)
      const planRetention = Number(plan.auditLogsRetentionDays);
      if (!Number.isFinite(planRetention) || planRetention <= 0) {
        logger.error(
          `Invalid or disabled audit logs retention for orgId=${orgId}, skipping insert. plan=${String(plan.auditLogsRetentionDays)}`
        );
        return; // skip invalid TTL
      }

      // Prefer project-level retention if valid and more restrictive than plan retention
      const projectRetention = project?.auditLogsRetentionDays;
      const ttlInDays =
        typeof projectRetention === "number" &&
          Number.isFinite(projectRetention) &&
          projectRetention > 0 &&
          projectRetention < planRetention
          ? projectRetention
          : planRetention;

      // Final sanity checks before computing TTL
      if (!Number.isFinite(ttlInDays) || ttlInDays <= 0) {
        logger.warn(
          `Invalid audit log TTL for projectId=${projectId}, orgId=${orgId}, skipping insert. plan=${String(plan.auditLogsRetentionDays)}, project=${String(project?.auditLogsRetentionDays)}`
        );
        return;
      }

      const ttl = ttlInDays * MS_IN_DAY;

      const createdAt = new Date(job.timestamp);
      const eventMetadata = normalizeJsonPayload(event.metadata);
      const actorMetadata = normalizeJsonPayload(actor.metadata);

      // UUIDv7 embeds job.timestamp so the id's time matches createdAt
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

      // Push to Redis stream for ClickHouse batch processing
      if (isClickHouseBatchEnabled) {
        try {
          await keyStore.streamAdd(AUDIT_LOG_CLICKHOUSE_STREAM_KEY, "*", {
            data: JSON.stringify(auditLog)
          });
        } catch (error) {
          logger.error(error, "Failed to push audit log to Redis stream for ClickHouse batch");
        }
      } else {
        await auditLogDAL.create(auditLog);
      }

      await auditLogStreamService.streamLog(orgId, auditLog);
    }
  });

  // Batch consumer: reads from Redis stream and inserts into ClickHouse every 5 seconds
  if (isClickHouseBatchEnabled) {
    queueService.start(QueueName.AuditLogClickHouseBatch, async () => {
      const { entries, lastId } = await keyStore.streamCollect(
        AUDIT_LOG_CLICKHOUSE_STREAM_KEY,
        AUDIT_LOG_CLICKHOUSE_BATCH_SIZE,
        AUDIT_LOG_CLICKHOUSE_MAX_ENTRIES
      );

      if (entries.length === 0 || !lastId) return;

      const values = entries.map(([, fields]) => JSON.parse(fields[1]) as Record<string, unknown>);

      try {
        await clickhouseClient!.insert({
          table: CLICKHOUSE_AUDIT_LOG_TABLE_NAME,
          clickhouse_settings: CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS,
          values,
          format: "JSONEachRow"
        });

        // Only trim after successful insert
        await keyStore.streamTrim(AUDIT_LOG_CLICKHOUSE_STREAM_KEY, lastId, true);

        logger.info({ count: values.length }, "Batch inserted audit logs into ClickHouse");
      } catch (error) {
        logger.error(error, `Failed to batch insert ${values.length} audit logs into ClickHouse`);
      }
    });

    // Schedule repeatable job every 5 seconds
    await queueService.upsertJobScheduler(
      QueueName.AuditLogClickHouseBatch,
      `${JOB_SCHEDULER_PREFIX}:audit-log-clickhouse-batch`,
      { every: 5000 },
      { name: QueueJobs.AuditLogClickHouseBatch }
    );
  }

  return {
    pushToLog
  };
};
