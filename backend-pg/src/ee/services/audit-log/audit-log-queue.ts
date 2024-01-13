import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDalFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TAuditLogDalFactory } from "./audit-log-dal";
import { TCreateAuditLogDTO } from "./audit-log-types";

type TAuditLogQueueServiceFactoryDep = {
  auditLogDal: TAuditLogDalFactory;
  queueService: TQueueServiceFactory;
  projectDal: Pick<TProjectDalFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TAuditLogQueueServiceFactory = ReturnType<typeof auditLogQueueServiceFactory>;

export const auditLogQueueServiceFactory = ({
  auditLogDal,
  queueService,
  projectDal,
  licenseService
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
    const { actor, event, ipAddress, projectId, userAgent, userAgentType } = job.data;
    let { orgId } = job.data;
    const MS_IN_DAY = 24 * 60 * 60 * 1000;

    if (!orgId) {
      // it will never be undefined for both org and project id
      // TODO(akhilmhdh): use caching here in dal to avoid db calls
      const project = await projectDal.findById(projectId as string);
      orgId = project.orgId;
    }

    const plan = await licenseService.getPlan(orgId);
    const ttl = plan.auditLogsRetentionDays * MS_IN_DAY;
    await auditLogDal.create({
      actor: actor.type,
      actorMetadata: actor.metadata,
      userAgent,
      projectId,
      ipAddress,
      orgId,
      eventType: event.type,
      expiresAt: new Date(Date.now() + ttl),
      eventMetadata: event.metadata,
      userAgentType
    });
  });

  return {
    pushToLog
  };
};
