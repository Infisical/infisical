import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { InternalServerError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TProjectEnvDALFactory } from "./project-env-dal";

export const SOFT_DELETE_GRACE_DAYS = 14;
export const SOFT_DELETE_GRACE_MS = SOFT_DELETE_GRACE_DAYS * 24 * 60 * 60 * 1000;

type TProjectEnvQueueFactoryDep = {
  queueService: TQueueServiceFactory;
  projectEnvDAL: Pick<TProjectEnvDALFactory, "findByIdIncludingExpired" | "delete" | "transaction">;
  keyStore: Pick<TKeyStoreFactory, "acquireLock">;
};

export type TProjectEnvQueueFactory = ReturnType<typeof projectEnvQueueFactory>;

export const projectEnvQueueFactory = ({ queueService, projectEnvDAL, keyStore }: TProjectEnvQueueFactoryDep) => {
  const scheduleHardDelete = async (envId: string, projectId: string, delayMs: number) => {
    await queueService.queue(
      QueueName.ProjectEnvHardDelete,
      QueueJobs.ProjectEnvHardDelete,
      { envId, projectId },
      {
        jobId: envId,
        delay: delayMs,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: true,
        removeOnFail: { count: 50 }
      }
    );
  };

  const cancelScheduledHardDelete = async (envId: string) => {
    await queueService.stopJobById(QueueName.ProjectEnvHardDelete, envId);

    // stop by ID swallows the error, so we need to check if the job still exists
    const stillScheduled = await queueService.jobExistsById(QueueName.ProjectEnvHardDelete, envId);
    if (stillScheduled) {
      logger.error(
        { envId, queue: QueueName.ProjectEnvHardDelete },
        `project-env: failed to cancel scheduled hard-delete [envId=${envId}]`
      );
      throw new InternalServerError({
        name: "CancelScheduledHardDelete",
        message: "Failed to cancel scheduled environment hard-delete. Please retry."
      });
    }
  };

  queueService.start(QueueName.ProjectEnvHardDelete, async (job) => {
    const { envId, projectId } = job.data;

    // first we check to see if a lock needs to be acquired, if not we skip the job
    // Read via transaction → primary, not replica. Defeats replica-lag races against a recent restore commit.
    const env = await projectEnvDAL.transaction((tx) => projectEnvDAL.findByIdIncludingExpired(envId, tx));
    if (!env || !env.expiredAt || env.expiredAt.getTime() > Date.now()) {
      logger.info(
        `project-env-hard-delete: skipping (gone/restored/not-yet-expired) [envId=${envId}] [projectId=${projectId}]`
      );
      return;
    }

    const lock = await keyStore
      .acquireLock([KeyStorePrefixes.ProjectEnvironmentLock(projectId)], 5000)
      .catch(() => null);
    if (!lock) {
      throw new Error(`project-env-hard-delete: could not acquire project lock [envId=${envId}]`);
    }

    try {
      const fresh = await projectEnvDAL.transaction((tx) => projectEnvDAL.findByIdIncludingExpired(envId, tx));
      if (!fresh || !fresh.expiredAt) {
        logger.info(`project-env-hard-delete: restored during lock acquisition, skipping [envId=${envId}]`);
        return;
      }

      await projectEnvDAL.delete({ id: envId, projectId });
      logger.info(`project-env-hard-delete: hard-deleted environment [envId=${envId}] [projectId=${projectId}]`);
    } finally {
      await lock.release();
    }
  });

  return { scheduleHardDelete, cancelScheduledHardDelete };
};
