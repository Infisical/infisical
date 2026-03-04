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

  const init = () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    queueService.start(
      QueueName.PamSessionExpiration,
      async (job) => {
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
      },
      {
        persistence: true
      }
    );
  };

  // Schedule a session expiration job to run at the session's expiresAt time
  const scheduleSessionExpiration = async (sessionId: string, expiresAt: Date) => {
    const now = new Date();
    const delayMs = Math.max(0, expiresAt.getTime() - now.getTime());
    const startAfter = new Date(now.getTime() + delayMs);

    await queueService.queue(
      QueueName.PamSessionExpiration,
      QueueJobs.PamSessionExpiration,
      { sessionId },
      {
        jobId: `pam-session-expiration-${sessionId}`,
        delay: delayMs
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
