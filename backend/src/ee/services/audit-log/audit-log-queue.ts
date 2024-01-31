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

const getTimeDiffForNextAuditLogPrune = (mills: number) => {
  const today = new Date(mills);
  // Get UTC midnight timestamp for today
  const nextUtcMidnight = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate(), 0, 0, 0));

  // Check if we have already passed UTC midnight today
  if (today.getTime() >= nextUtcMidnight.getTime()) {
    // Add one day to get the timestamp for tomorrow's UTC midnight
    nextUtcMidnight.setDate(nextUtcMidnight.getDate() + 1);
  }
  return nextUtcMidnight.getTime();
};

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

  queueService.start(
    QueueName.AuditLogPrune,
    async () => {
      logger.info("Started audit log pruning");
      await auditLogDAL.pruneAuditLog();
      // calculate next utc time delay
      // const nextPruneTime = getTimeDiffForNextAuditLogPrune();
      // await queueService.stopJobById(QueueName.AuditLogPrune, "audit-log-prune");
      logger.info("Finished audit log pruning");
    },
    {
      settings: {
        repeatStrategy: getTimeDiffForNextAuditLogPrune
      }
    }
  );

  // we are not using repeat because we want to run the in a predictable time of midnight UTC
  // repeat has only cron job and every so we do the repeat manually
  const startAuditLogPruneJob = async () => {
    // clear previous job
    await queueService.stopRepeatableJob(
      QueueName.AuditLogPrune,
      QueueJobs.AuditLogPrune,
      {},
      QueueName.AuditLogPrune // just a job id
    );
    await queueService.queue(QueueName.AuditLogPrune, QueueJobs.AuditLogPrune, undefined, {
      delay: 5000,
      jobId: QueueName.AuditLogPrune,
      repeat: {}
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
