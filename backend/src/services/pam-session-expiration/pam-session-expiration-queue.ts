import { TPamSessionDALFactory } from "@app/ee/services/pam-session/pam-session-dal";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

type TPamSessionExpirationServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pamSessionDAL: Pick<TPamSessionDALFactory, "expireSessionById">;
};

export type TPamSessionExpirationServiceFactory = ReturnType<typeof pamSessionExpirationServiceFactory>;

export const pamSessionExpirationServiceFactory = ({
  queueService,
  pamSessionDAL
}: TPamSessionExpirationServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    await queueService.startPg<QueueName.PamSessionExpiration>(
      QueueJobs.PamSessionExpiration,
      async (jobs) => {
        await Promise.all(
          jobs.map(async (job) => {
            const { sessionId } = job.data;
            try {
              logger.info({ sessionId }, `${QueueName.PamSessionExpiration}: expiring session`);
              const updated = await pamSessionDAL.expireSessionById(sessionId);
              if (updated > 0) {
                logger.info({ sessionId }, `${QueueName.PamSessionExpiration}: session expired successfully`);
              } else {
                logger.info(
                  { sessionId },
                  `${QueueName.PamSessionExpiration}: session not expired (already ended or not found)`
                );
              }
            } catch (error) {
              logger.error(error, `${QueueName.PamSessionExpiration}: failed to expire session ${sessionId}`);
              throw error;
            }
          })
        );
      },
      {
        batchSize: 1,
        workerCount: 1,
        pollingIntervalSeconds: 30
      }
    );
  };

  // Schedule a session expiration job to run at the session's expiresAt time
  const scheduleSessionExpiration = async (sessionId: string, expiresAt: Date) => {
    const now = new Date();
    const delayMs = Math.max(0, expiresAt.getTime() - now.getTime());
    const startAfter = new Date(now.getTime() + delayMs);

    await queueService.queuePg<QueueName.PamSessionExpiration>(
      QueueJobs.PamSessionExpiration,
      { sessionId },
      {
        startAfter,
        singletonKey: `pam-session-expiration-${sessionId}`
      }
    );

    logger.info(
      { sessionId, expiresAt: expiresAt.toISOString(), scheduledFor: startAfter.toISOString() },
      `${QueueName.PamSessionExpiration}: scheduled session expiration`
    );
  };

  return {
    init,
    scheduleSessionExpiration
  };
};
