import { getConfig } from "@app/lib/config/env";
import { secondsToMillis } from "@app/lib/dates";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TPkiAcmeChallengeServiceFactory } from "./pki-acme-types";

type TPkiAcmeQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  acmeChallengeService: TPkiAcmeChallengeServiceFactory;
};

export type TPkiAcmeQueueServiceFactory = Awaited<ReturnType<typeof pkiAcmeQueueServiceFactory>>;

export const pkiAcmeQueueServiceFactory = async ({
  queueService,
  acmeChallengeService
}: TPkiAcmeQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  // TODO(dq): verify persistance needed or not
  // Initialize the worker to process challenge validation jobs
  queueService.start(QueueName.PkiAcmeChallengeValidation, async (job) => {
    const { challengeId } = job.data;
    const retryCount = job.attemptsMade || 0;
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
  });

  const queueChallengeValidation = async (challengeId: string): Promise<void> => {
    if (appCfg.isSecondaryInstance) {
      return;
    }

    logger.info({ challengeId }, "Queueing ACME challenge validation");
    await queueService.queue(
      QueueName.PkiAcmeChallengeValidation,
      QueueJobs.PkiAcmeChallengeValidation,
      { challengeId },
      {
        jobId: `pki-acme-challenege-${challengeId}`,
        removeOnFail: true,
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: secondsToMillis(30)
        }
      }
    );
  };

  return {
    queueChallengeValidation
  };
};
