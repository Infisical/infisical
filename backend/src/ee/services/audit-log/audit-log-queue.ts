import type { ClickHouseClient } from "@clickhouse/client";
import { randomUUID } from "crypto";

import type { TProjects } from "@app/db/schemas";
import { TAuditLogStreamServiceFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-service";
import { TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
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

// keep this timeout 5s it must be fast because else the queue will take time to finish
// audit log is a crowded queue thus needs to be fast
export const AUDIT_LOG_STREAM_TIMEOUT = 5 * 1000;
const MS_IN_DAY = 24 * 60 * 60 * 1000;
const AUDIT_LOG_CLICKHOUSE_STREAM_KEY = "audit-log-clickhouse-stream";
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
    // Push to Redis stream for ClickHouse batch processing
    if (isClickHouseBatchEnabled) {
      try {
        const { actor, event, ipAddress, projectId, userAgent, userAgentType } = data;
        let { orgId } = data;

        let project: TProjects | undefined;
        if (!orgId) {
          project = await projectDAL.findById(projectId as string);
          orgId = project.orgId;
        }

        const plan = await licenseService.getPlan(orgId);
        const ttlInDays =
          project?.auditLogsRetentionDays && project.auditLogsRetentionDays < plan.auditLogsRetentionDays
            ? project.auditLogsRetentionDays
            : plan.auditLogsRetentionDays;

        const ttl = ttlInDays * MS_IN_DAY;

        if (ttl > 0) {
          await keyStore.streamAdd(AUDIT_LOG_CLICKHOUSE_STREAM_KEY, "*", {
            data: JSON.stringify({
              id: randomUUID(),
              actor: actor.type,
              actorMetadata: actor.metadata ?? {},
              ipAddress: ipAddress ?? "",
              eventType: event.type,
              eventMetadata: event.metadata ?? {},
              userAgent: userAgent ?? "",
              userAgentType: userAgentType ?? "",
              projectId: projectId ?? "",
              orgId,
              expiresAt: new Date(Date.now() + ttl),
              createdAt: new Date()
            })
          });
        }
      } catch (error) {
        logger.error(error, "Failed to push audit log to Redis stream for ClickHouse batch");
      }
    }

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
      const ttlInDays =
        project?.auditLogsRetentionDays && project.auditLogsRetentionDays < plan.auditLogsRetentionDays
          ? project.auditLogsRetentionDays
          : plan.auditLogsRetentionDays;

      const ttl = ttlInDays * MS_IN_DAY;

      const auditLog = await auditLogDAL.create({
        actor: actor.type,
        actorMetadata: actor.metadata,
        userAgent,
        projectId,
        projectName: project?.name,
        ipAddress,
        orgId,
        eventType: event.type,
        expiresAt: new Date(Date.now() + ttl),
        eventMetadata: event.metadata,
        userAgentType
      });
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

      // Single insert into ClickHouse
      await clickhouseClient!.insert({
        table: CLICKHOUSE_AUDIT_LOG_TABLE_NAME,
        clickhouse_settings: CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS,
        values,
        format: "JSONEachRow"
      });

      // Only trim after successful insert
      await keyStore.streamTrim(AUDIT_LOG_CLICKHOUSE_STREAM_KEY, lastId, true);

      logger.info({ count: values.length }, "Batch inserted audit logs into ClickHouse");
    });

    // Schedule repeatable job every 5 seconds
    await queueService.queue(QueueName.AuditLogClickHouseBatch, QueueJobs.AuditLogClickHouseBatch, undefined, {
      jobId: "audit-log-clickhouse-batch",
      repeat: {
        every: 5000,
        key: "audit-log-clickhouse-batch"
      },
      removeOnFail: true,
      removeOnComplete: true
    });
  }

  return {
    pushToLog
  };
};
