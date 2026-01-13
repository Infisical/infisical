import { TAuditLogStreamServiceFactory } from "@app/ee/services/audit-log-stream/audit-log-stream-service";
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
  auditLogStreamService
}: TAuditLogQueueServiceFactoryDep): Promise<TAuditLogQueueServiceFactory> => {
  const pushToLog = async (data: TCreateAuditLogDTO) => {
    await queueService.queue<QueueName.AuditLog>(QueueName.AuditLog, QueueJobs.AuditLog, data, {
      removeOnFail: {
        count: 3
      },
      removeOnComplete: true
    });
  };

  queueService.start(QueueName.AuditLog, async (job) => {
    const { actor, event, ipAddress, projectId, userAgent, userAgentType } = job.data;
    let { orgId } = job.data;
    const MS_IN_DAY = 24 * 60 * 60 * 1000;
    const DEFAULT_AUDIT_LOG_RETENTION_DAYS = 90;
    let project;

    if (!orgId) {
      // it will never be undefined for both org and project id
      // TODO(akhilmhdh): use caching here in dal to avoid db calls
      project = await projectDAL.findById(projectId as string);
      orgId = project.orgId;
    }

    const plan = await licenseService.getPlan(orgId);

    // Default to 90 days if not defined
    const retentionDays = plan.auditLogsRetentionDays ?? DEFAULT_AUDIT_LOG_RETENTION_DAYS;

    // skip inserting if audit log retention is 0 meaning its not supported
    if (retentionDays !== 0) {
      const ttlInDays =
        project?.auditLogsRetentionDays !== undefined &&
        project.auditLogsRetentionDays < retentionDays
          ? project.auditLogsRetentionDays
          : retentionDays;
          // Skip insertion if effective retention is 0
          if (ttlInDays === 0) {
            return;
          }

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

  return {
    pushToLog
  };
};
