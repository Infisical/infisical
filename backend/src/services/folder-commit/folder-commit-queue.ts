import { Knex } from "knex";

import { TSecretFolders } from "@app/db/schemas/secret-folders";
import { KeyStorePrefixes, TKeyStoreFactory } from "@app/keystore/keystore";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TFolderTreeCheckpointDALFactory } from "../folder-tree-checkpoint/folder-tree-checkpoint-dal";
import { TFolderTreeCheckpointResourcesDALFactory } from "../folder-tree-checkpoint-resources/folder-tree-checkpoint-resources-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TFolderCommitDALFactory } from "./folder-commit-dal";

// Define types for job data
type TCreateFolderTreeCheckpointDTO = {
  envId: string;
  failedToAcquireLockCount?: number;
  folderCommitId?: string;
};

type TFolderCommitQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "getItem" | "deleteItem">;
  folderTreeCheckpointDAL: Pick<
    TFolderTreeCheckpointDALFactory,
    "create" | "findLatestByEnvId" | "findNearestCheckpoint"
  >;
  folderTreeCheckpointResourcesDAL: Pick<
    TFolderTreeCheckpointResourcesDALFactory,
    "insertMany" | "findByTreeCheckpointId"
  >;
  folderCommitDAL: Pick<
    TFolderCommitDALFactory,
    "findLatestEnvCommit" | "getEnvNumberOfCommitsSince" | "findMultipleLatestCommits" | "findById"
  >;
  folderDAL: Pick<TSecretFolderDALFactory, "findByEnvId">;
};

export type TFolderCommitQueueServiceFactory = ReturnType<typeof folderCommitQueueServiceFactory>;

export const folderCommitQueueServiceFactory = ({
  queueService,
  keyStore,
  folderTreeCheckpointDAL,
  folderTreeCheckpointResourcesDAL,
  folderCommitDAL,
  folderDAL
}: TFolderCommitQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  // Helper function to calculate delay for requeuing
  const getRequeueDelay = (failureCount?: number) => {
    if (!failureCount) return 0;

    const baseDelay = 5000;
    const maxDelay = 30000;

    const delay = Math.min(baseDelay * 2 ** failureCount, maxDelay);
    const jitter = delay * (0.5 + Math.random() * 0.5);

    return jitter;
  };

  const scheduleTreeCheckpoint = async (payload: TCreateFolderTreeCheckpointDTO) => {
    const { envId, failedToAcquireLockCount = 0 } = payload;

    // Create a unique jobId for each retry to prevent conflicts
    const jobId =
      failedToAcquireLockCount > 0 ? `${envId}-retry-${failedToAcquireLockCount}-${Date.now()}` : `${envId}`;

    await queueService.queue(QueueName.FolderTreeCheckpoint, QueueJobs.CreateFolderTreeCheckpoint, payload, {
      jobId,
      delay: getRequeueDelay(failedToAcquireLockCount),
      backoff: {
        type: "exponential",
        delay: 3000
      },
      removeOnFail: {
        count: 3
      },
      removeOnComplete: true
    });
  };

  // Sort folders by hierarchy (copied from the source code)
  const sortFoldersByHierarchy = (folders: TSecretFolders[]) => {
    const childrenMap = new Map<string, TSecretFolders[]>();
    const allFolderIds = new Set<string>();

    folders.forEach((folder) => {
      if (folder.id) allFolderIds.add(folder.id);
    });

    folders.forEach((folder) => {
      if (folder.parentId) {
        const children = childrenMap.get(folder.parentId) || [];
        children.push(folder);
        childrenMap.set(folder.parentId, children);
      }
    });

    const rootFolders = folders.filter((folder) => !folder.parentId || !allFolderIds.has(folder.parentId));

    const result = [];
    let currentLevel = rootFolders;

    while (currentLevel.length > 0) {
      result.push(...currentLevel);

      const nextLevel = [];
      for (const folder of currentLevel) {
        if (folder.id) {
          const children = childrenMap.get(folder.id) || [];
          nextLevel.push(...children);
        }
      }

      currentLevel = nextLevel;
    }

    return result;
  };

  const createFolderTreeCheckpoint = async (jobData: TCreateFolderTreeCheckpointDTO, tx?: Knex) => {
    const { envId, folderCommitId, failedToAcquireLockCount = 0 } = jobData;

    logger.info(`Folder tree checkpoint creation started [envId=${envId}] [attempt=${failedToAcquireLockCount + 1}]`);

    // First, try to clear any stale locks before attempting to acquire
    if (failedToAcquireLockCount > 1) {
      try {
        await keyStore.deleteItem(KeyStorePrefixes.FolderTreeCheckpoint(envId));
        logger.info(`Cleared potential stale lock for envId ${envId} before attempt ${failedToAcquireLockCount + 1}`);
      } catch (error) {
        // This is fine if it fails, we'll still try to acquire the lock
        logger.info(`No stale lock found for envId ${envId}`);
      }
    }

    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;

    try {
      // Attempt to acquire the lock with a shorter timeout for first attempts
      const timeout = failedToAcquireLockCount > 3 ? 60 * 1000 : 15 * 1000;

      logger.info(`Attempting to acquire lock for envId=${envId} with timeout ${timeout}ms`);

      lock = await keyStore.acquireLock([KeyStorePrefixes.FolderTreeCheckpoint(envId)], timeout);

      logger.info(`Successfully acquired lock for envId=${envId}`);
    } catch (e) {
      logger.info(
        `Failed to acquire lock for folder tree checkpoint [envId=${envId}] [attempt=${failedToAcquireLockCount + 1}]`
      );

      // Requeue with incremented failure count if under max attempts
      if (failedToAcquireLockCount < 10) {
        // Force a delay between retries
        const nextRetryCount = failedToAcquireLockCount + 1;

        logger.info(`Scheduling retry #${nextRetryCount} for folder tree checkpoint [envId=${envId}]`);

        // Create a new job with incremented counter
        await scheduleTreeCheckpoint({
          envId,
          folderCommitId,
          failedToAcquireLockCount: nextRetryCount
        });
      } else {
        // Max retries reached
        logger.error(`Maximum lock acquisition attempts (10) reached for envId ${envId}. Giving up.`);
        // Try to force-clear the lock for next time
        try {
          await keyStore.deleteItem(KeyStorePrefixes.FolderTreeCheckpoint(envId));
        } catch (clearError) {
          logger.error(clearError, `Failed to clear lock after maximum retries for envId=${envId}`);
        }
      }
      return;
    }

    if (!lock) {
      logger.error(`Lock is undefined after acquisition for envId=${envId}. This should never happen.`);
      return;
    }

    try {
      logger.info(`Processing tree checkpoint data for envId=${envId}`);

      const latestTreeCheckpoint = await folderTreeCheckpointDAL.findLatestByEnvId(envId, tx);

      let latestCommit;
      if (folderCommitId) {
        latestCommit = await folderCommitDAL.findById(folderCommitId, tx);
      } else {
        latestCommit = await folderCommitDAL.findLatestEnvCommit(envId, tx);
      }
      if (!latestCommit) {
        logger.info(`Latest commit ID not found for envId ${envId}`);
        return;
      }
      const latestCommitId = latestCommit.id;

      if (latestTreeCheckpoint) {
        const commitsSinceLastCheckpoint = await folderCommitDAL.getEnvNumberOfCommitsSince(
          envId,
          latestTreeCheckpoint.folderCommitId,
          tx
        );
        if (commitsSinceLastCheckpoint < Number(appCfg.PIT_TREE_CHECKPOINT_WINDOW)) {
          logger.info(
            `Commits since last checkpoint ${commitsSinceLastCheckpoint} is less than ${appCfg.PIT_TREE_CHECKPOINT_WINDOW}`
          );
          return;
        }
      }

      const folders = await folderDAL.findByEnvId(envId, tx);
      const sortedFolders = sortFoldersByHierarchy(folders);
      const filteredFoldersIds = sortedFolders.filter((folder) => !folder.isReserved).map((folder) => folder.id);

      const folderCommits = await folderCommitDAL.findMultipleLatestCommits(filteredFoldersIds, tx);
      const folderTreeCheckpoint = await folderTreeCheckpointDAL.create(
        {
          folderCommitId: latestCommitId
        },
        tx
      );

      await folderTreeCheckpointResourcesDAL.insertMany(
        folderCommits.map((folderCommit) => ({
          folderTreeCheckpointId: folderTreeCheckpoint.id,
          folderId: folderCommit.folderId,
          folderCommitId: folderCommit.id
        })),
        tx
      );

      logger.info(`Folder tree checkpoint created successfully: ${folderTreeCheckpoint.id}`);
    } catch (error) {
      logger.error(error, `Error processing folder tree checkpoint [envId=${envId}]`);
      throw error;
    } finally {
      // Always release the lock
      try {
        if (lock) {
          await lock.release();
          logger.info(`Released lock for folder tree checkpoint [envId=${envId}]`);
        } else {
          logger.error(`No lock to release for envId=${envId}. This should never happen.`);
        }
      } catch (releaseError) {
        logger.error(releaseError, `Error releasing lock for folder tree checkpoint [envId=${envId}]`);
        // Try to force delete the lock if release fails
        try {
          await keyStore.deleteItem(KeyStorePrefixes.FolderTreeCheckpoint(envId));
          logger.info(`Force deleted lock after release failure for envId=${envId}`);
        } catch (deleteError) {
          logger.error(deleteError, `Failed to force delete lock after release failure for envId=${envId}`);
        }
      }
    }
  };

  queueService.start(QueueName.FolderTreeCheckpoint, async (job) => {
    try {
      if (job.name === QueueJobs.CreateFolderTreeCheckpoint) {
        const jobData = job.data as TCreateFolderTreeCheckpointDTO;
        await createFolderTreeCheckpoint(jobData);
      }
    } catch (error) {
      logger.error(error, "Error creating folder tree checkpoint:");
      throw error;
    }
  });

  return {
    scheduleTreeCheckpoint: (envId: string) => scheduleTreeCheckpoint({ envId }),
    createFolderTreeCheckpoint: (envId: string, folderCommitId?: string, tx?: Knex) =>
      createFolderTreeCheckpoint({ envId, folderCommitId }, tx)
  };
};
