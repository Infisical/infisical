import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { honeyTokenCleanupLogContext, THoneyTokenCleanupServiceFactory } from "./honey-token-cleanup-service";
import { THoneyTokenDALFactory } from "./honey-token-dal";
import { HoneyTokenStatus } from "./honey-token-enums";

const FOLDERLESS_CLEANUP_BATCH = 100;
const MAX_CLEANUP_ATTEMPTS = 3;
const CLEANUP_WORKER_CONCURRENCY = 3;

type THoneyTokenCleanupQueueFactoryDep = {
  honeyTokenDAL: Pick<THoneyTokenDALFactory, "findFolderlessForCleanup" | "findByIdForCleanup" | "deleteById">;
  honeyTokenCleanupService: Pick<THoneyTokenCleanupServiceFactory, "revokeHoneyToken">;
  queueService: Pick<TQueueServiceFactory, "queue" | "start">;
};

export type THoneyTokenCleanupQueueFactory = ReturnType<typeof honeyTokenCleanupQueueFactory>;

export const honeyTokenCleanupQueueFactory = ({
  honeyTokenDAL,
  honeyTokenCleanupService,
  queueService
}: THoneyTokenCleanupQueueFactoryDep) => {
  // Deleting a folder or environment leaves its honey tokens behind with a null folderId (the foreign key is
  // SET NULL), so every folder deletion path is covered without each one calling in here. The jobId keeps a
  // row that is already queued from being queued again.
  const queueFolderlessHoneyTokenCleanup = async () => {
    try {
      const honeyTokens = await honeyTokenDAL.findFolderlessForCleanup(FOLDERLESS_CLEANUP_BATCH);

      for await (const honeyToken of honeyTokens) {
        await queueService.queue(
          QueueName.HoneyTokenCleanup,
          QueueJobs.HoneyTokenCleanup,
          { honeyTokenId: honeyToken.id },
          {
            jobId: `honey-token-cleanup-${honeyToken.id}`,
            attempts: MAX_CLEANUP_ATTEMPTS,
            backoff: { type: "exponential", delay: 30_000 },
            removeOnComplete: true,
            removeOnFail: true
          }
        );
      }
    } catch (err) {
      logger.error({ err }, "honey-token-cleanup: failed to queue clean up of honey tokens of deleted folders");
    }
  };

  const $processCleanupJob = async (honeyTokenId: string, isLastAttempt: boolean) => {
    const honeyToken = await honeyTokenDAL.findByIdForCleanup(honeyTokenId);
    if (!honeyToken) return;

    try {
      if (honeyToken.status !== HoneyTokenStatus.Revoked) {
        await honeyTokenCleanupService.revokeHoneyToken(honeyToken);
      }
    } catch (err) {
      if (!isLastAttempt) throw err;

      // Deleting here, rather than letting the job fail, keeps the next cron run from queueing it again.
      logger.error(
        { err },
        `honey-token-cleanup: could not clean up honey token after ${MAX_CLEANUP_ATTEMPTS} attempts, deleting it anyway ${honeyTokenCleanupLogContext(honeyToken)}`
      );
    }

    await honeyTokenDAL.deleteById(honeyToken.id);
  };

  const init = () => {
    queueService.start(
      QueueName.HoneyTokenCleanup,
      async (job) => {
        await $processCleanupJob(job.data.honeyTokenId, job.attemptsMade + 1 >= MAX_CLEANUP_ATTEMPTS);
      },
      { concurrency: CLEANUP_WORKER_CONCURRENCY }
    );
  };

  return {
    queueFolderlessHoneyTokenCleanup,
    init
  };
};
