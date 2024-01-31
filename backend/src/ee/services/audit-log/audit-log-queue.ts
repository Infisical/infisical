import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";
import { TProjectDALFactory } from "@app/services/project/project-dal";

import { TLicenseServiceFactory } from "../license/license-service";
import { TAuditLogDALFactory } from "./audit-log-dal";
import { TCreateAuditLogDTO } from "./audit-log-types";

type TAuditLogQueueServiceFactoryDep = {
  auditLogDAL: TAuditLogDALFactory;
  queueService: TQueueServiceFactory;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  licenseService: Pick<TLicenseServiceFactory, "getPlan">;
};

export type TAuditLogQueueServiceFactory = ReturnType<typeof auditLogQueueServiceFactory>;

export const auditLogQueueServiceFactory = ({
  auditLogDAL,
  queueService,
  projectDAL,
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
      const project = await projectDAL.findById(projectId as string);
      orgId = project.orgId;
    }

    const plan = await licenseService.getPlan(orgId);
    const ttl = plan.auditLogsRetentionDays * MS_IN_DAY;
    // skip inserting if audit log retension is 0 meaning its not supported
    if (ttl === 0) return;
    await auditLogDAL.create({
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

  queueService.start(QueueName.AuditLogPrune, async () => {
    logger.info("Started audit log pruning");
    await auditLogDAL.pruneAuditLog();
    // calculate next utc time delay
    // const nextPruneTime = getTimeDiffForNextAuditLogPrune();
    // await queueService.stopJobById(QueueName.AuditLogPrune, "audit-log-prune");
    logger.info("Finished audit log pruning");
  });

  // we do a repeat cron job in utc timezone at 12 Midnight each day
  const startAuditLogPruneJob = async () => {
    // clear previous job
    await queueService.stopRepeatableJob(
      QueueName.AuditLogPrune,
      QueueJobs.AuditLogPrune,
      { pattern: "0 0 * * *", utc: true },
      QueueName.AuditLogPrune // just a job id
    );

    await queueService.queue(QueueName.AuditLogPrune, QueueJobs.AuditLogPrune, undefined, {
      delay: 5000,
      jobId: QueueName.AuditLogPrune,
      repeat: { pattern: "0 0 * * *", utc: true }
    });
  };

  queueService.listen(QueueName.AuditLogPrune, "error", (err) => {
    logger.error("Audit log pruning failed");
    logger.error(err);
  });

  return {
    pushToLog,
    startAuditLogPruneJob
  };
};
