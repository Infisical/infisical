import { TPamAccountServiceFactory } from "@app/ee/services/pam-account/pam-account-service";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

type TPamAccountRotationServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  pamAccountService: Pick<TPamAccountServiceFactory, "rotateAllDueAccounts">;
};

export type TPamAccountRotationServiceFactory = ReturnType<typeof pamAccountRotationServiceFactory>;

export const pamAccountRotationServiceFactory = ({
  queueService,
  pamAccountService
}: TPamAccountRotationServiceFactoryDep) => {
  const appCfg = getConfig();

  const init = async () => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    await queueService.stopRepeatableJob(
      QueueName.PamAccountRotation,
      QueueJobs.PamAccountRotation,
      { pattern: "0 * * * *", utc: true },
      QueueName.PamAccountRotation // job id
    );

    queueService.start(
      QueueName.PamAccountRotation,
      async () => {
        try {
          logger.info(`${QueueName.PamAccountRotation}: pam account rotation task started`);
          await pamAccountService.rotateAllDueAccounts();
          logger.info(`${QueueName.PamAccountRotation}: pam account rotation task completed`);
        } catch (error) {
          logger.error(error, `${QueueName.PamAccountRotation}: pam account rotation failed`);
          throw error;
        }
      },
      {
        persistence: true
      }
    );

    await queueService.schedulePg(
      QueueJobs.PamAccountRotation,
      "0 * * * *", // Schedule to run every hour
      undefined,
      { tz: "UTC" }
    );
  };

  return {
    init
  };
};
