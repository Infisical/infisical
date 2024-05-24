import { TAuditLogDALFactory } from "@app/ee/services/audit-log/audit-log-dal";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TIdentityAccessTokenDALFactory } from "../identity-access-token/identity-access-token-dal";

type TDailyResourceCleanUpQueueServiceFactoryDep = {
  auditLogDAL: Pick<TAuditLogDALFactory, "pruneAuditLog">;
  identityAccessTokenDAL: Pick<TIdentityAccessTokenDALFactory, "removeExpiredTokens">;
  queueService: TQueueServiceFactory;
};

export type TDailyResourceCleanUpQueueServiceFactory = ReturnType<typeof dailyResourceCleanUpQueueServiceFactory>;

export const dailyResourceCleanUpQueueServiceFactory = ({
  auditLogDAL,
  queueService,
  identityAccessTokenDAL
}: TDailyResourceCleanUpQueueServiceFactoryDep) => {
  queueService.start(QueueName.DailyResourceCleanUp, async () => {
    logger.info(`${QueueName.DailyResourceCleanUp}: queue task started`);
    await auditLogDAL.pruneAuditLog();
    await identityAccessTokenDAL.removeExpiredTokens();
    logger.info(`${QueueName.DailyResourceCleanUp}: queue task completed`);
  });

  // we do a repeat cron job in utc timezone at 12 Midnight each day
  const startCleanUp = async () => {
    // TODO(akhilmhdh): remove later
    await queueService.stopRepeatableJob(
      QueueName.AuditLogPrune,
      QueueJobs.AuditLogPrune,
      { pattern: "0 0 * * *", utc: true },
      QueueName.AuditLogPrune // just a job id
    );
    // clear previous job
    await queueService.stopRepeatableJob(
      QueueName.DailyResourceCleanUp,
      QueueJobs.DailyResourceCleanUp,
      { pattern: "0 0 * * *", utc: true },
      QueueName.DailyResourceCleanUp // just a job id
    );

    await queueService.queue(QueueName.DailyResourceCleanUp, QueueJobs.DailyResourceCleanUp, undefined, {
      delay: 5000,
      jobId: QueueName.DailyResourceCleanUp,
      repeat: { pattern: "0 0 * * *", utc: true }
    });
  };

  queueService.listen(QueueName.DailyResourceCleanUp, "failed", (_, err) => {
    logger.error(err, `${QueueName.DailyResourceCleanUp}: resource cleanup failed`);
  });

  return {
    startCleanUp
  };
};
