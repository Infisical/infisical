import type { ClickHouseClient } from "@clickhouse/client";
import { randomUUID } from "crypto";

import type { TProjects } from "@app/db/schemas";
import { TAuditLogStreamServiceFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-service";
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
};

export type TAuditLogQueueServiceFactory = {
  pushToLog: (data: TCreateAuditLogDTO) => Promise<void>;
};

// keep this timeout 5s it must be fast because else the queue will take time to finish
// audit log is a crowded queue thus needs to be fast
export const AUDIT_LOG_STREAM_TIMEOUT = 5 * 1000;

export const auditLogQueueServiceFactory = async ({
  auditLogDAL,
  queueService,
  projectDAL,
  licenseService,
  auditLogStreamService,
  clickhouseClient
}: TAuditLogQueueServiceFactoryDep): Promise<TAuditLogQueueServiceFactory> => {
  const { CLICKHOUSE_AUDIT_LOG_ENABLED, CLICKHOUSE_AUDIT_LOG_TABLE_NAME, CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS } =
    getConfig();

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
    const MS_IN_DAY = 24 * 60 * 60 * 1000;
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

      if (clickhouseClient && CLICKHOUSE_AUDIT_LOG_ENABLED) {
        try {
          await clickhouseClient.insert({
            table: CLICKHOUSE_AUDIT_LOG_TABLE_NAME,
            clickhouse_settings: CLICKHOUSE_AUDIT_LOG_INSERT_SETTINGS,
            values: [
              {
                // with the same id as the audit log in clickhouse, so that it's much easier to
                // find the corresponding audit log in postgres
                id: auditLog.id,
                actor: actor.type,
                actorMetadata: actor.metadata ?? {},
                ipAddress: ipAddress ?? "",
                eventType: event.type,
                eventMetadata: event.metadata ?? {},
                userAgent: userAgent ?? "",
                userAgentType: userAgentType ?? "",
                // with the same createdAt as the audit log from postgres, so that it's much easier to
                // deduplicate the audit logs
                createdAt: auditLog.createdAt,
                projectId: projectId ?? "",
                orgId
              }
            ],
            format: "JSONEachRow"
          });
        } catch (error) {
          logger.error(error, `Failed to insert audit log to ClickHouse [auditLogId=${auditLog.id}]`);
        }
      }
    }
  });

  return {
    pushToLog
  };
};
