import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TAuditLogDalFactory } from "./audit-log-dal";
import { TCreateAuditLogDTO } from "./audit-log-types";

type TAuditLogQueueServiceFactoryDep = {
  auditLogDal: TAuditLogDalFactory;
  queueService: TQueueServiceFactory;
};

export type TAuditLogQueueServiceFactory = ReturnType<typeof auditLogQueueServiceFactory>;

export const auditLogQueueServiceFactory = ({
  auditLogDal,
  queueService
}: TAuditLogQueueServiceFactoryDep) => {
  const pushToLog = async (data: TCreateAuditLogDTO) => {
    await queueService.queue(QueueName.AuditLog, QueueJobs.AuditLog, data, {
      removeOnFail: {
        count: 5
      },
      removeOnComplete: true
    });
  };

  queueService.start(QueueName.AuditLog, async (job) => {
    const { actor, orgId, event, ipAddress, projectId, userAgent, userAgentType } = job.data;
    const MS_IN_DAY = 24 * 60 * 60 * 1000;
    await auditLogDal.create({
      actor: actor.type,
      actorMetadata: actor.metadata,
      userAgent,
      projectId,
      ipAddress,
      orgId,
      eventType: event.type,
      expiresAt: new Date(Date.now() + 30 * MS_IN_DAY),
      eventMetadata: event.metadata,
      userAgentType
    });
  });

  return {
    pushToLog
  };
};
