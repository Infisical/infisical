import { Knex } from "knex";

import { TSecretFolders } from "@app/db/schemas";
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
  folderCommitId?: string;
};

// Cooldown period in seconds after a checkpoint is created before another can be scheduled
const CHECKPOINT_COOLDOWN_SECONDS = 30;
// Maximum number of retry attempts for queue jobs
const MAX_QUEUE_ATTEMPTS = 5;

type TFolderCommitQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
  keyStore: Pick<TKeyStoreFactory, "acquireLock" | "getItem" | "setItemWithExpiry" | "deleteItem">;
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

  const scheduleTreeCheckpoint = async (payload: TCreateFolderTreeCheckpointDTO) => {
    const { envId } = payload;

    // Check cooldown - skip if a checkpoint was recently created for this environment
    try {
      const cooldownKey = KeyStorePrefixes.FolderTreeCheckpointCooldown(envId);
      const cooldown = await keyStore.getItem(cooldownKey);
      if (cooldown) {
        logger.info(`Skipping tree checkpoint schedule for envId=${envId} - cooldown active`);
        return;
      }
    } catch (error) {
      // If cooldown check fails, proceed with scheduling (fail-open)
      logger.warn(`Failed to check cooldown for envId=${envId}, proceeding with schedule`);
    }

    // Use a stable job ID based only on envId for natural BullMQ deduplication.
    // If a job for this envId is already queued/delayed, BullMQ will skip the duplicate.
    await queueService.queue(QueueName.FolderTreeCheckpoint, QueueJobs.CreateFolderTreeCheckpoint, payload, {
      jobId: `tree-checkpoint-${envId}`,
      delay: 1000, // 1 second delay to batch rapid commits into a single checkpoint
      backoff: {
        type: "exponential",
        delay: 5000
      },
      attempts: MAX_QUEUE_ATTEMPTS,
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

  /**
   * Checks whether a new tree checkpoint is needed for the given environment.
   * Returns the latest commit ID if a checkpoint should be created, or undefined if not needed.
   */
  const isCheckpointNeeded = async (envId: string, folderCommitId?: string, tx?: Knex): Promise<string | undefined> => {
    const latestTreeCheckpoint = await folderTreeCheckpointDAL.findLatestByEnvId(envId, tx);

    let latestCommit;
    if (folderCommitId) {
      latestCommit = await folderCommitDAL.findById(folderCommitId, tx);
    } else {
      latestCommit = await folderCommitDAL.findLatestEnvCommit(envId, tx);
    }
    if (!latestCommit) {
      logger.info(`Latest commit ID not found for envId ${envId}`);
      return undefined;
    }

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
        return undefined;
      }
    }

    return latestCommit.id;
  };

  const createFolderTreeCheckpoint = async (jobData: TCreateFolderTreeCheckpointDTO, tx?: Knex) => {
    const { envId, folderCommitId } = jobData;

    logger.info(`Folder tree checkpoint creation started [envId=${envId}]`);

    // Pre-lock check: verify if a checkpoint is actually needed before acquiring the lock.
    // This avoids unnecessary lock contention when the checkpoint window hasn't been reached.
    const preCheckCommitId = await isCheckpointNeeded(envId, folderCommitId, tx);
    if (!preCheckCommitId) {
      logger.info(`Pre-lock check: checkpoint not needed for envId=${envId}, skipping lock acquisition`);
      return;
    }

    let lock: Awaited<ReturnType<typeof keyStore.acquireLock>> | undefined;

    try {
      lock = await keyStore.acquireLock([KeyStorePrefixes.FolderTreeCheckpoint(envId)], 15 * 1000);
      logger.info(`Successfully acquired lock for envId=${envId}`);
    } catch (e) {
      // Let BullMQ handle retry via its built-in exponential backoff mechanism.
      // This avoids creating duplicate retry jobs with unique IDs that caused lock contention storms.
      logger.info(`Failed to acquire lock for folder tree checkpoint [envId=${envId}], will be retried by queue`);
      throw e;
    }

    try {
      // Post-lock double-check: another worker may have created a checkpoint while we waited for the lock.
      // Re-verify to avoid creating redundant checkpoints.
      const postCheckCommitId = await isCheckpointNeeded(envId, folderCommitId, tx);
      if (!postCheckCommitId) {
        logger.info(`Post-lock check: checkpoint no longer needed for envId=${envId}`);
        return;
      }

      logger.info(`Processing tree checkpoint data for envId=${envId}`);

      const folders = await folderDAL.findByEnvId(envId, tx);
      const sortedFolders = sortFoldersByHierarchy(folders);
      const filteredFoldersIds = sortedFolders.filter((folder) => !folder.isReserved).map((folder) => folder.id);

      const folderCommits = await folderCommitDAL.findMultipleLatestCommits(filteredFoldersIds, tx);
      const folderTreeCheckpoint = await folderTreeCheckpointDAL.create(
        {
          folderCommitId: postCheckCommitId
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

      // Set cooldown to prevent rapid re-scheduling for this environment
      try {
        await keyStore.setItemWithExpiry(
          KeyStorePrefixes.FolderTreeCheckpointCooldown(envId),
          CHECKPOINT_COOLDOWN_SECONDS,
          "1"
        );
      } catch (cooldownError) {
        // Non-critical: if cooldown fails to set, checkpoint was still created successfully
        logger.warn(`Failed to set cooldown for envId=${envId}`);
      }

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
