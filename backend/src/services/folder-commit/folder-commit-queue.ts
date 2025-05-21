import { Knex } from "knex";

import { TSecretFolders } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { logger } from "@app/lib/logger";
import { QueueJobs, QueueName, TQueueServiceFactory } from "@app/queue";

import { TFolderTreeCheckpointDALFactory } from "../folder-tree-checkpoint/folder-tree-checkpoint-dal";
import { TFolderTreeCheckpointResourcesDALFactory } from "../folder-tree-checkpoint-resources/folder-tree-checkpoint-resources-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TFolderCommitDALFactory } from "./folder-commit-dal";

type TFolderCommitQueueServiceFactoryDep = {
  queueService: TQueueServiceFactory;
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
  folderTreeCheckpointDAL,
  folderTreeCheckpointResourcesDAL,
  folderCommitDAL,
  folderDAL
}: TFolderCommitQueueServiceFactoryDep) => {
  const appCfg = getConfig();

  const scheduleTreeCheckpoint = async (envId: string) => {
    await queueService.queue(
      QueueName.FolderTreeCheckpoint,
      QueueJobs.CreateFolderTreeCheckpoint,
      { envId },
      {
        jobId: `${envId}`,
        backoff: {
          type: "exponential",
          delay: 3000
        },
        removeOnFail: {
          count: 3
        },
        removeOnComplete: true
      }
    );
  };

  const schedulePeriodicTreeCheckpoint = async (envId: string, intervalMs: number) => {
    await queueService.queue(
      QueueName.FolderTreeCheckpoint,
      QueueJobs.CreateFolderTreeCheckpoint,
      { envId },
      {
        jobId: `periodic-${envId}`,
        repeat: {
          every: intervalMs
        },
        backoff: {
          type: "exponential",
          delay: 3000
        },
        removeOnFail: false,
        removeOnComplete: false
      }
    );
  };

  const cancelScheduledTreeCheckpoint = async (envId: string) => {
    await queueService.stopJobById(QueueName.FolderTreeCheckpoint, envId);
    await queueService.stopRepeatableJobByJobId(QueueName.FolderTreeCheckpoint, `periodic-${envId}`);
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

  const createFolderTreeCheckpoint = async (envId: string, folderCommitId?: string, tx?: Knex) => {
    logger.info("Folder tree checkpoint creation started:", envId);

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

    logger.info("Folder tree checkpoint created successfully:", folderTreeCheckpoint.id);
  };

  queueService.start(QueueName.FolderTreeCheckpoint, async (job) => {
    try {
      if (job.name === QueueJobs.CreateFolderTreeCheckpoint) {
        const { envId } = job.data as { envId: string };
        await createFolderTreeCheckpoint(envId);
      }
    } catch (error) {
      logger.error(error, "Error creating folder tree checkpoint:");
      throw error;
    }
  });

  return {
    scheduleTreeCheckpoint,
    schedulePeriodicTreeCheckpoint,
    cancelScheduledTreeCheckpoint,
    createFolderTreeCheckpoint
  };
};
