import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TPkiAcmeChallengeServiceFactory } from "./pki-acme-types";

type TPkiAcmeQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  acmeChallengeService: TPkiAcmeChallengeServiceFactory;
};

export const pkiAcmeQueueServiceFactory = async ({
  queueService,
  acmeChallengeService
}: TPkiAcmeQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  // Initialize the worker to process challenge validation jobs
  await queueService.startPg<QueueName.PkiAcmeChallengeValidation>(
    QueueJobs.PkiAcmeChallengeValidation,
    async ([job]) => {
      const { challengeId } = job.data;
      const retryCount = job.retryCount || 0;
      try {
        logger.info({ challengeId, retryCount }, "Processing ACME challenge validation job");
        await acmeChallengeService.validateChallengeResponse(challengeId, retryCount);
        logger.info({ challengeId, retryCount }, "ACME challenge validation completed successfully");
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(
          error,
          `Failed to validate ACME challenge ${challengeId} (retryCount ${retryCount}): ${errorMessage}`
        );
        // Re-throw to let pg-boss handle retries with exponential backoff
        throw error;
      }
    },
    {
      batchSize: 1,
      workerCount: 2,
      pollingIntervalSeconds: 1
    }
  );

  const queueChallengeValidation = async (challengeId: string): Promise<void> => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    logger.info({ challengeId }, "Queueing ACME challenge validation");
    await queueService.queuePg(
      QueueJobs.PkiAcmeChallengeValidation,
      { challengeId },
      {
        retryLimit: 3,
        retryDelay: 30 * 1000, // Base delay of 30 seconds
        retryBackoff: true // Exponential backoff: 30s, 60s, 120s
      }
    );
  };

  return {
    queueChallengeValidation
  };
};

export type TPkiAcmeQueueServiceFactory = Awaited<ReturnType<typeof pkiAcmeQueueServiceFactory>>;
