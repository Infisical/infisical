/* eslint-disable no-await-in-loop */
import { Knex } from "knex";

import { TSecretFolders, TSecretFolderVersions, TSecretVersionsV2 } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";

import { ActorType } from "../auth/auth-type";
import { TFolderCheckpointDALFactory } from "../folder-checkpoint/folder-checkpoint-dal";
import { TFolderCheckpointResourcesDALFactory } from "../folder-checkpoint-resources/folder-checkpoint-resources-dal";
import { TFolderCommitChangesDALFactory } from "../folder-commit-changes/folder-commit-changes-dal";
import { TFolderTreeCheckpointDALFactory } from "../folder-tree-checkpoint/folder-tree-checkpoint-dal";
import { TFolderTreeCheckpointResourcesDALFactory } from "../folder-tree-checkpoint-resources/folder-tree-checkpoint-resources-dal";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretFolderVersionDALFactory } from "../secret-folder/secret-folder-version-dal";
import * as secretV2BridgeDal from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TFolderCommitDALFactory } from "./folder-commit-dal";
import { TFolderCommitQueueServiceFactory } from "./folder-commit-queue";

// Define enums for better type safety
export enum ChangeType {
  ADD = "add",
  DELETE = "delete",
  UPDATE = "update",
  CREATE = "create"
}

enum ResourceType {
  SECRET = "secret",
  FOLDER = "folder"
}

// Improved types for DTO objects
type TCreateCommitDTO = {
  actor: {
    type: string;
    metadata?: {
      name?: string;
      id?: string;
    };
  };
  message?: string;
  folderId: string;
  changes: {
    type: string;
    secretVersionId?: string;
    folderVersionId?: string;
  }[];
};

type TCommitChangeDTO = {
  folderCommitId: string;
  changeType: string;
  secretVersionId?: string;
  folderVersionId?: string;
};

export type ResourceChange = {
  type: string;
  id: string;
  versionId: string;
  oldVersionId?: string;
  changeType: ChangeType;
  commitId: number;
  createdAt?: Date;
  parentId?: string;
};

type ActorInfo = {
  actorType: string;
  actorId?: string;
  message?: string;
};

type StateChangeResult = {
  secretChangesCount: number;
  folderChangesCount: number;
  totalChanges: number;
};

type TFolderCommitServiceFactoryDep = {
  folderCommitDAL: Pick<
    TFolderCommitDALFactory,
    | "create"
    | "findById"
    | "findByFolderId"
    | "findLatestCommit"
    | "transaction"
    | "getNumberOfCommitsSince"
    | "getEnvNumberOfCommitsSince"
    | "findCommitsToRecreate"
    | "findMultipleLatestCommits"
    | "findLatestCommitBetween"
    | "findAllCommitsBetween"
    | "findLatestEnvCommit"
    | "findLatestCommitByFolderIds"
  >;
  folderCommitChangesDAL: Pick<TFolderCommitChangesDALFactory, "create" | "findByCommitId" | "insertMany">;
  folderCheckpointDAL: Pick<
    TFolderCheckpointDALFactory,
    "create" | "findByFolderId" | "findLatestByFolderId" | "findNearestCheckpoint"
  >;
  folderCheckpointResourcesDAL: Pick<TFolderCheckpointResourcesDALFactory, "insertMany" | "findByCheckpointId">;
  folderTreeCheckpointDAL: Pick<
    TFolderTreeCheckpointDALFactory,
    "create" | "findNearestCheckpoint" | "findLatestByEnvId"
  >;
  folderTreeCheckpointResourcesDAL: Pick<
    TFolderTreeCheckpointResourcesDALFactory,
    "insertMany" | "findByTreeCheckpointId"
  >;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    | "findByParentId"
    | "findByProjectId"
    | "deleteById"
    | "create"
    | "updateById"
    | "update"
    | "find"
    | "findById"
    | "findByEnvId"
    | "findFoldersByRootAndIds"
  >;
  folderVersionDAL: Pick<
    TSecretFolderVersionDALFactory,
    | "findLatestFolderVersions"
    | "findById"
    | "deleteById"
    | "create"
    | "updateById"
    | "find"
    | "findByIdsWithLatestVersion"
  >;
  secretVersionV2BridgeDAL: Pick<
    TSecretVersionV2DALFactory,
    | "findLatestVersionByFolderId"
    | "findById"
    | "deleteById"
    | "create"
    | "updateById"
    | "find"
    | "findByIdsWithLatestVersion"
  >;
  secretV2BridgeDAL: Pick<
    secretV2BridgeDal.TSecretV2BridgeDALFactory,
    "deleteById" | "create" | "updateById" | "update" | "insertMany" | "invalidateSecretCacheByProjectId"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById">;
  folderCommitQueueService?: Pick<TFolderCommitQueueServiceFactory, "scheduleTreeCheckpoint">;
};

export const folderCommitServiceFactory = ({
  folderCommitDAL,
  folderCommitChangesDAL,
  folderCheckpointDAL,
  folderTreeCheckpointDAL,
  folderCheckpointResourcesDAL,
  userDAL,
  identityDAL,
  folderDAL,
  folderVersionDAL,
  secretVersionV2BridgeDAL,
  projectDAL,
  secretV2BridgeDAL,
  folderTreeCheckpointResourcesDAL,
  folderCommitQueueService
}: TFolderCommitServiceFactoryDep) => {
  const appCfg = getConfig();

  /**
   * Fetches all resources within a folder
   */
  const getFolderResources = async (folderId: string, tx?: Knex) => {
    const resources = [];
    const subFolders = await folderDAL.findByParentId(folderId, tx);

    if (subFolders.length > 0) {
      const subFolderIds = subFolders.map((folder) => folder.id);
      const folderVersions = await folderVersionDAL.findLatestFolderVersions(subFolderIds, tx);
      resources.push(...Object.values(folderVersions).map((folderVersion) => ({ folderVersionId: folderVersion.id })));
    }

    const secretVersions = await secretVersionV2BridgeDAL.findLatestVersionByFolderId(folderId, tx);
    if (secretVersions.length > 0) {
      resources.push(...secretVersions.map((secretVersion) => ({ secretVersionId: secretVersion.id })));
    }

    return resources;
  };

  /**
   * Creates a checkpoint for a folder if necessary
   */
  const createFolderCheckpoint = async ({
    folderId,
    folderCommitId,
    force = false,
    tx
  }: {
    folderId: string;
    folderCommitId?: string;
    force?: boolean;
    tx?: Knex;
  }) => {
    let latestCommitId = folderCommitId;
    const latestCheckpoint = await folderCheckpointDAL.findLatestByFolderId(folderId, tx);

    if (!latestCommitId) {
      const latestCommit = await folderCommitDAL.findLatestCommit(folderId, tx);
      if (!latestCommit) {
        throw new BadRequestError({ message: "Latest commit ID not found" });
      }
      latestCommitId = latestCommit.id;
    }

    if (!force && latestCheckpoint) {
      const commitsSinceLastCheckpoint = await folderCommitDAL.getNumberOfCommitsSince(
        folderId,
        latestCheckpoint.folderCommitId,
        tx
      );
      if (commitsSinceLastCheckpoint < Number(appCfg.PIT_CHECKPOINT_WINDOW)) {
        return;
      }
    }

    const checkpointResources = await getFolderResources(folderId, tx);

    if (checkpointResources.length > 0) {
      const newCheckpoint = await folderCheckpointDAL.create(
        {
          folderCommitId: latestCommitId
        },
        tx
      );
      await folderCheckpointResourcesDAL.insertMany(
        checkpointResources.map((resource) => ({ folderCheckpointId: newCheckpoint.id, ...resource })),
        tx
      );
    }
    return latestCommitId;
  };

  /**
   * Reconstructs the state of a folder at a specific commit
   */
  const reconstructFolderState = async (
    folderCommitId: string,
    tx?: Knex
  ): Promise<{ type: string; id: string; versionId: string }[]> => {
    const targetCommit = await folderCommitDAL.findById(folderCommitId, tx);
    if (!targetCommit) {
      throw new NotFoundError({ message: `Commit with ID ${folderCommitId} not found` });
    }

    const nearestCheckpoint = await folderCheckpointDAL.findNearestCheckpoint(folderCommitId, tx);
    if (!nearestCheckpoint) {
      throw new NotFoundError({ message: `Nearest checkpoint not found for commit ${folderCommitId}` });
    }

    const checkpointResources = await folderCheckpointResourcesDAL.findByCheckpointId(nearestCheckpoint.id, tx);

    const folderState: Record<string, { type: string; id: string; versionId: string }> = {};

    // Add all checkpoint resources to initial state
    checkpointResources.forEach((resource) => {
      if (resource.secretVersionId && resource.referencedSecretId) {
        folderState[`secret-${resource.referencedSecretId}`] = {
          type: "secret",
          id: resource.referencedSecretId,
          versionId: resource.secretVersionId
        };
      } else if (resource.folderVersionId && resource.referencedFolderId) {
        folderState[`folder-${resource.referencedFolderId}`] = {
          type: "folder",
          id: resource.referencedFolderId,
          versionId: resource.folderVersionId
        };
      }
    });

    const commitsToRecreate = await folderCommitDAL.findCommitsToRecreate(
      targetCommit.folderId,
      targetCommit.commitId,
      nearestCheckpoint.commitId,
      tx
    );

    // Process commits to recreate final state
    for (const commit of commitsToRecreate) {
      // eslint-disable-next-line no-continue
      if (!commit.changes) continue;

      for (const change of commit.changes) {
        if (change.secretVersionId && change.referencedSecretId) {
          const key = `secret-${change.referencedSecretId}`;

          if (change.changeType.toLowerCase() === "add") {
            folderState[key] = {
              type: "secret",
              id: change.referencedSecretId,
              versionId: change.secretVersionId
            };
          } else if (change.changeType.toLowerCase() === "delete") {
            delete folderState[key];
          }
        } else if (change.folderVersionId && change.referencedFolderId) {
          const key = `folder-${change.referencedFolderId}`;

          if (change.changeType.toLowerCase() === "add") {
            folderState[key] = {
              type: "folder",
              id: change.referencedFolderId,
              versionId: change.folderVersionId
            };
          } else if (change.changeType.toLowerCase() === "delete") {
            delete folderState[key];
          }
        }
      }
    }
    return Object.values(folderState);
  };

  /**
   * Compares folder states between two commits and returns the differences
   */
  const compareFolderStates = async ({
    currentCommitId,
    targetCommitId,
    tx
  }: {
    currentCommitId?: string;
    targetCommitId: string;
    tx?: Knex;
  }) => {
    const targetCommit = await folderCommitDAL.findById(targetCommitId, tx);
    if (!targetCommit) {
      throw new NotFoundError({ message: `Commit with ID ${targetCommitId} not found` });
    }

    // If currentCommitId is not provided, mark all resources in target as creates
    if (!currentCommitId) {
      const targetState = await reconstructFolderState(targetCommitId, tx);

      return targetState.map((resource) => ({
        type: resource.type,
        id: resource.id,
        versionId: resource.versionId,
        changeType: "create",
        commitId: targetCommit.commitId
      })) as ResourceChange[];
    }

    // Original logic for when currentCommitId is provided
    const currentState = await reconstructFolderState(currentCommitId, tx);
    const targetState = await reconstructFolderState(targetCommitId, tx);

    // Create lookup maps for easier comparison
    const currentMap: Record<string, { type: string; id: string; versionId: string }> = {};
    const targetMap: Record<string, { type: string; id: string; versionId: string }> = {};

    // Build lookup maps
    currentState.forEach((resource) => {
      const key = `${resource.type}-${resource.id}`;
      currentMap[key] = resource;
    });

    targetState.forEach((resource) => {
      const key = `${resource.type}-${resource.id}`;
      targetMap[key] = resource;
    });

    // Track differences
    const differences: ResourceChange[] = [];

    // Find deletes and updates
    Object.keys(currentMap).forEach((key) => {
      const currentResource = currentMap[key];
      const targetResource = targetMap[key];

      if (!targetResource) {
        differences.push({
          type: currentResource.type,
          id: currentResource.id,
          versionId: currentResource.versionId,
          changeType: ChangeType.DELETE,
          commitId: targetCommit.commitId
        });
      } else if (currentResource.versionId !== targetResource.versionId) {
        differences.push({
          type: targetResource.type,
          id: targetResource.id,
          versionId: targetResource.versionId,
          changeType: ChangeType.UPDATE,
          commitId: targetCommit.commitId
        });
      }
    });

    // Find creates
    Object.keys(targetMap).forEach((key) => {
      if (!currentMap[key]) {
        const targetResource = targetMap[key];
        differences.push({
          type: targetResource.type,
          id: targetResource.id,
          versionId: targetResource.versionId,
          changeType: ChangeType.CREATE,
          commitId: targetCommit.commitId,
          createdAt: targetCommit.createdAt
        });
      }
    });

    return differences;
  };

  /**
   * Adds a change to an existing commit
   */
  const addCommitChange = async (data: TCommitChangeDTO, tx?: Knex) => {
    try {
      if (!data.secretVersionId && !data.folderVersionId) {
        throw new BadRequestError({ message: "Either secretVersionId or folderVersionId must be provided" });
      }

      const commit = await folderCommitDAL.findById(data.folderCommitId, tx);
      if (!commit) {
        throw new NotFoundError({ message: `Commit with ID ${data.folderCommitId} not found` });
      }

      return await folderCommitChangesDAL.create(data, tx);
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new DatabaseError({ error, name: "AddCommitChange" });
    }
  };

  /**
   * Creates a new commit with the provided changes
   */
  const createCommit = async (data: TCreateCommitDTO, tx?: Knex) => {
    try {
      const metadata = { ...data.actor.metadata } || {};

      if (data.actor.type === ActorType.USER && data.actor.metadata?.id) {
        const user = await userDAL.findById(data.actor.metadata?.id, tx);
        metadata.name = user?.username;
      }

      if (data.actor.type === ActorType.IDENTITY && data.actor.metadata?.id) {
        const identity = await identityDAL.findById(data.actor.metadata?.id, tx);
        metadata.name = identity?.name;
      }

      const folder = await folderDAL.findById(data.folderId, tx);
      if (!folder) {
        throw new NotFoundError({ message: `Folder with ID ${data.folderId} not found` });
      }

      const newCommit = await folderCommitDAL.create(
        {
          actorMetadata: metadata,
          actorType: data.actor.type,
          message: data.message,
          folderId: data.folderId,
          envId: folder.envId
        },
        tx
      );

      await folderCommitChangesDAL.insertMany(
        data.changes.map((change) => ({
          folderCommitId: newCommit.id,
          changeType: change.type,
          secretVersionId: change.secretVersionId,
          folderVersionId: change.folderVersionId
        })),
        tx
      );

      await createFolderCheckpoint({ folderId: data.folderId, tx });
      if (folderCommitQueueService) {
        await folderCommitQueueService.scheduleTreeCheckpoint(folder.envId);
      }
      return newCommit;
    } catch (error) {
      if (error instanceof NotFoundError || error instanceof BadRequestError) {
        throw error;
      }
      throw new DatabaseError({ error, name: "CreateCommit" });
    }
  };

  /**
   * Process secret changes when applying folder state differences
   */
  const processSecretChanges = async (
    changes: ResourceChange[],
    secretVersions: Record<string, TSecretVersionsV2>,
    actorInfo: ActorInfo,
    folderId: string,
    tx?: Knex
  ) => {
    const commitChanges = [];

    for (const change of changes) {
      const secretVersion = secretVersions[change.id];
      // eslint-disable-next-line no-continue
      if (!secretVersion) continue;

      switch (change.changeType) {
        case "create":
          {
            const newSecret = [
              {
                id: change.id,
                skipMultilineEncoding: secretVersion.skipMultilineEncoding,
                version: secretVersion.version + 1,
                type: secretVersion.type,
                key: secretVersion.key,
                reminderNote: secretVersion.reminderNote,
                reminderRepeatDays: secretVersion.reminderRepeatDays,
                encryptedValue: secretVersion.encryptedValue,
                encryptedComment: secretVersion.encryptedComment,
                userId: secretVersion.userId,
                metadata: secretVersion.metadata,
                folderId
              }
            ];
            await secretV2BridgeDAL.insertMany(newSecret, tx);

            const newVersion = await secretVersionV2BridgeDAL.create(
              {
                folderId,
                secretId: secretVersion.secretId,
                version: secretVersion.version + 1,
                encryptedValue: secretVersion.encryptedValue,
                key: secretVersion.key,
                encryptedComment: secretVersion.encryptedComment,
                skipMultilineEncoding: secretVersion.skipMultilineEncoding,
                reminderNote: secretVersion.reminderNote,
                reminderRepeatDays: secretVersion.reminderRepeatDays,
                userId: secretVersion.userId,
                metadata: secretVersion.metadata,
                actorType: actorInfo.actorType,
                envId: secretVersion.envId,
                ...(actorInfo.actorType === ActorType.IDENTITY && { identityActorId: actorInfo.actorId }),
                ...(actorInfo.actorType === ActorType.USER && { userActorId: actorInfo.actorId })
              },
              tx
            );

            commitChanges.push({
              type: ChangeType.ADD,
              secretVersionId: newVersion.id
            });
          }
          break;

        case "update":
          {
            await secretV2BridgeDAL.updateById(
              change.id,
              {
                skipMultilineEncoding: secretVersion?.skipMultilineEncoding,
                version: secretVersion?.version,
                type: secretVersion?.type,
                key: secretVersion?.key,
                reminderNote: secretVersion?.reminderNote,
                reminderRepeatDays: secretVersion?.reminderRepeatDays,
                encryptedValue: secretVersion?.encryptedValue,
                encryptedComment: secretVersion?.encryptedComment,
                userId: secretVersion?.userId,
                metadata: secretVersion?.metadata
              },
              tx
            );

            const newVersion = await secretVersionV2BridgeDAL.create(
              {
                version: secretVersion.version + 1,
                encryptedValue: secretVersion.encryptedValue,
                key: secretVersion.key,
                encryptedComment: secretVersion.encryptedComment,
                skipMultilineEncoding: secretVersion.skipMultilineEncoding,
                reminderNote: secretVersion.reminderNote,
                reminderRepeatDays: secretVersion.reminderRepeatDays,
                userId: secretVersion.userId,
                metadata: secretVersion.metadata,
                actorType: actorInfo.actorType,
                envId: secretVersion.envId,
                folderId,
                secretId: secretVersion.secretId,
                ...(actorInfo.actorType === ActorType.IDENTITY && { identityActorId: actorInfo.actorId }),
                ...(actorInfo.actorType === ActorType.USER && { userActorId: actorInfo.actorId })
              },
              tx
            );

            commitChanges.push({
              type: ChangeType.ADD,
              secretVersionId: newVersion.id
            });
          }
          break;

        case "delete":
          await secretV2BridgeDAL.deleteById(change.id, tx);

          commitChanges.push({
            type: ChangeType.DELETE,
            secretVersionId: change.versionId
          });
          break;

        default:
          throw new BadRequestError({ message: `Unknown change type: ${change.changeType}` });
      }
    }

    return commitChanges;
  };

  /**
   * Core function to apply folder state differences
   */
  const applyFolderStateDifferencesFn = async ({
    differences,
    actorInfo,
    folderId,
    projectId,
    reconstructNewFolders,
    reconstructUpToCommit,
    step = 0,
    tx
  }: {
    differences: ResourceChange[];
    actorInfo: ActorInfo;
    folderId: string;
    projectId: string;
    reconstructNewFolders: boolean;
    reconstructUpToCommit?: string;
    step: number;
    tx?: Knex;
  }): Promise<StateChangeResult> => {
    /**
     * Process folder changes when applying folder state differences
     */
    const processFolderChanges = async (
      changes: ResourceChange[],
      folderVersions: Record<string, TSecretFolderVersions>
    ) => {
      const commitChanges = [];

      for (const change of changes) {
        const folderVersion = folderVersions[change.id];

        switch (change.changeType) {
          case "create":
            if (folderVersion) {
              const newFolder = {
                id: change.id,
                parentId: folderId,
                envId: folderVersion.envId,
                version: (folderVersion.version || 1) + 1,
                name: folderVersion.name
              };
              await folderDAL.create(newFolder, tx);

              const newFolderVersion = await folderVersionDAL.create(
                {
                  folderId: change.id,
                  version: (folderVersion.version || 1) + 1,
                  name: folderVersion.name,
                  envId: folderVersion.envId
                },
                tx
              );

              if (reconstructNewFolders && reconstructUpToCommit && step < 20) {
                const subFolderLatestCommit = await folderCommitDAL.findLatestCommitBetween({
                  folderId: change.id,
                  endCommitId: reconstructUpToCommit,
                  tx
                });
                if (subFolderLatestCommit) {
                  const subFolderDiff = await compareFolderStates({
                    targetCommitId: subFolderLatestCommit.id,
                    tx
                  });
                  if (subFolderDiff?.length > 0) {
                    await applyFolderStateDifferencesFn({
                      differences: subFolderDiff,
                      actorInfo,
                      folderId: change.id,
                      projectId,
                      reconstructNewFolders,
                      reconstructUpToCommit,
                      step: step + 1,
                      tx
                    });
                  }
                }
              }

              commitChanges.push({
                type: ChangeType.ADD,
                folderVersionId: newFolderVersion.id
              });
            }
            break;

          case "update":
            if (change.versionId) {
              const versionDetails = await folderVersionDAL.findById(change.versionId, tx);
              if (versionDetails) {
                await folderDAL.updateById(
                  change.id,
                  {
                    parentId: folderId,
                    envId: versionDetails.envId,
                    version: (versionDetails.version || 1) + 1,
                    name: versionDetails.name
                  },
                  tx
                );

                const newFolderVersion = await folderVersionDAL.create(
                  {
                    folderId: change.id,
                    version: (versionDetails.version || 1) + 1,
                    name: versionDetails.name,
                    envId: versionDetails.envId
                  },
                  tx
                );

                commitChanges.push({
                  type: ChangeType.ADD,
                  folderVersionId: newFolderVersion.id
                });
              }
            }
            break;

          case "delete":
            await folderDAL.deleteById(change.id, tx);

            commitChanges.push({
              type: ChangeType.DELETE,
              folderVersionId: change.versionId
            });
            break;

          default:
            throw new BadRequestError({ message: `Unknown change type: ${change.changeType}` });
        }
      }

      return commitChanges;
    };
    // Group differences by type for more efficient processing
    const secretChanges = differences.filter((diff) => diff.type === ResourceType.SECRET);
    const folderChanges = differences.filter((diff) => diff.type === ResourceType.FOLDER);

    // Batch fetch necessary data
    const secretVersions = await secretVersionV2BridgeDAL.findByIdsWithLatestVersion(
      folderId,
      secretChanges.map((diff) => diff.id),
      secretChanges.map((diff) => diff.versionId)
    );

    const folderVersions = await folderVersionDAL.findByIdsWithLatestVersion(
      folderChanges.map((diff) => diff.id),
      folderChanges.map((diff) => diff.versionId)
    );

    // Process changes in parallel
    const [secretCommitChanges, folderCommitChanges] = await Promise.all([
      processSecretChanges(secretChanges, secretVersions, actorInfo, folderId, tx),
      processFolderChanges(folderChanges, folderVersions)
    ]);

    // Combine all changes
    const allCommitChanges = [...secretCommitChanges, ...folderCommitChanges];

    // Create a commit with all the changes
    await createCommit(
      {
        actor: {
          type: actorInfo.actorType,
          metadata: { id: actorInfo.actorId }
        },
        message: actorInfo.message || "Rolled back folder state",
        folderId,
        changes: allCommitChanges
      },
      tx
    );

    // Invalidate cache to reflect the changes
    await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);

    return {
      secretChangesCount: secretChanges.length,
      folderChangesCount: folderChanges.length,
      totalChanges: differences.length
    };
  };

  /**
   * Apply folder state differences with transaction handling
   */
  const applyFolderStateDifferences = async (params: {
    differences: ResourceChange[];
    actorInfo: ActorInfo;
    folderId: string;
    projectId: string;
    reconstructNewFolders: boolean;
    reconstructUpToCommit?: string;
    tx?: Knex;
  }): Promise<StateChangeResult> => {
    // If a transaction was provided, use it directly
    if (params.tx) {
      return applyFolderStateDifferencesFn({ ...params, step: 0 });
    }

    // Otherwise, start a new transaction
    return folderCommitDAL.transaction((newTx) => applyFolderStateDifferencesFn({ ...params, tx: newTx, step: 0 }));
  };

  /**
   * Retrieve a commit by ID
   */
  const getCommitById = async (id: string, tx?: Knex) => {
    return folderCommitDAL.findById(id, tx);
  };

  /**
   * Get all commits for a folder
   */
  const getCommitsByFolderId = async (folderId: string, tx?: Knex) => {
    return folderCommitDAL.findByFolderId(folderId, tx);
  };

  /**
   * Get changes for a commit
   */
  const getCommitChanges = async (commitId: string, tx?: Knex) => {
    return folderCommitChangesDAL.findByCommitId(commitId, tx);
  };

  /**
   * Get checkpoints for a folder
   */
  const getCheckpointsByFolderId = async (folderId: string, limit?: number, tx?: Knex) => {
    return folderCheckpointDAL.findByFolderId(folderId, limit, tx);
  };

  /**
   * Get the latest checkpoint for a folder
   */
  const getLatestCheckpoint = async (folderId: string, tx?: Knex) => {
    return folderCheckpointDAL.findLatestByFolderId(folderId, tx);
  };

  /**
   * Initialize a folder with its current state
   */
  const initializeFolder = async (folderId: string, tx?: Knex) => {
    const folderResources = await getFolderResources(folderId, tx);
    const changes = folderResources.map((resource) => ({ type: ChangeType.ADD, ...resource }));

    if (changes.length > 0) {
      const newCommit = await createCommit(
        {
          actor: {
            type: ActorType.PLATFORM
          },
          message: "Initialized folder",
          folderId,
          changes
        },
        tx
      );
      await createFolderCheckpoint({ folderId, folderCommitId: newCommit.id, force: true, tx });
    }
  };

  /**
   * Sort folders by hierarchy (parents before children)
   */
  const sortFoldersByHierarchy = (folders: TSecretFolders[]) => {
    // Create a map for quick lookup of children by parent ID
    const childrenMap = new Map<string, TSecretFolders[]>();

    // Set of all folder IDs
    const allFolderIds = new Set<string>();

    // Build the set of all folder IDs
    folders.forEach((folder) => {
      if (folder.id) {
        allFolderIds.add(folder.id);
      }
    });

    // Group folders by their parentId
    folders.forEach((folder) => {
      if (folder.parentId) {
        const children = childrenMap.get(folder.parentId) || [];
        children.push(folder);
        childrenMap.set(folder.parentId, children);
      }
    });

    // Find root folders - those with no parentId or with a parentId that doesn't exist
    const rootFolders = folders.filter((folder) => !folder.parentId || !allFolderIds.has(folder.parentId));

    // Process each level of the hierarchy
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
   * Create a checkpoint for a folder tree
   */
  const createFolderTreeCheckpoint = async (envId: string, folderCommitId?: string, tx?: Knex) => {
    let latestCommitId = folderCommitId;
    const latestTreeCheckpoint = await folderTreeCheckpointDAL.findLatestByEnvId(envId, tx);

    if (!latestCommitId) {
      const latestCommit = await folderCommitDAL.findLatestEnvCommit(envId, tx);
      if (!latestCommit) {
        logger.info(`createFolderTreeCheckpoint - Latest commit ID not found for envId ${envId}`);
        return;
      }
      latestCommitId = latestCommit.id;
    }

    if (latestTreeCheckpoint) {
      const commitsSinceLastCheckpoint = await folderCommitDAL.getEnvNumberOfCommitsSince(
        envId,
        latestTreeCheckpoint.folderCommitId,
        tx
      );
      if (commitsSinceLastCheckpoint < Number(appCfg.PIT_TREE_CHECKPOINT_WINDOW)) {
        logger.info(
          `createFolderTreeCheckpoint - Commits since last checkpoint ${commitsSinceLastCheckpoint} is less than ${appCfg.PIT_TREE_CHECKPOINT_WINDOW}`
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
  };

  /**
   * Initialize a project with its current state
   */
  const initializeProject = async (projectId: string, tx?: Knex) => {
    const project = await projectDAL.findById(projectId, tx);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID ${projectId} not found` });
    }

    const folders = await folderDAL.findByProjectId(projectId, tx);
    const sortedFolders = sortFoldersByHierarchy(folders);

    await Promise.all(sortedFolders.map((folder) => initializeFolder(folder.id, tx)));

    const envIds = [...new Set(folders.map((folder) => folder.envId))];
    await Promise.all(
      envIds.map(async (envId) => {
        await createFolderTreeCheckpoint(envId, undefined, tx);
      })
    );
  };

  /**
   * Roll back a folder tree to a specific commit
   */
  const deepRollbackFolder = async (
    targetCommitId: string,
    envId: string,
    actorId: string,
    actorType: ActorType,
    projectId: string,
    tx?: Knex
  ) => {
    const targetCommit = await folderCommitDAL.findById(targetCommitId, tx);
    if (!targetCommit) {
      throw new NotFoundError({ message: `No commit found for commit ID ${targetCommitId}` });
    }

    const checkpoint = await folderTreeCheckpointDAL.findNearestCheckpoint(targetCommitId, envId, tx);
    if (!checkpoint) {
      throw new NotFoundError({ message: `No checkpoint found for commit ID ${targetCommitId}` });
    }

    const folderCheckpointCommits = await folderTreeCheckpointResourcesDAL.findByTreeCheckpointId(checkpoint.id, tx);
    const folderCommits = await folderCommitDAL.findAllCommitsBetween({
      envId,
      endCommitId: targetCommit.commitId.toString(),
      startCommitId: checkpoint.commitId.toString(),
      tx
    });

    // Group commits by folderId and keep only the latest
    const folderGroups = new Map<string, { createdAt: Date; id: string }>();

    if (folderCheckpointCommits && folderCheckpointCommits.length > 0) {
      for (const commit of folderCheckpointCommits) {
        folderGroups.set(commit.folderId, {
          createdAt: commit.createdAt,
          id: commit.folderCommitId
        });
      }
    }

    if (folderCommits && folderCommits.length > 0) {
      for (const commit of folderCommits) {
        const { folderId, createdAt, id } = commit;
        const existingCommit = folderGroups.get(folderId);

        if (!existingCommit || createdAt.getTime() > existingCommit.createdAt.getTime()) {
          folderGroups.set(folderId, { createdAt, id });
        }
      }
    }

    const folderDiffs = new Map<string, ResourceChange[]>();

    // Process each folder to determine differences
    await Promise.all(
      Array.from(folderGroups.entries()).map(async ([folderId, commit]) => {
        const latestFolderCommit = await folderCommitDAL.findLatestCommit(folderId, tx);
        if (latestFolderCommit && latestFolderCommit.id !== commit.id) {
          const diff = await compareFolderStates({
            currentCommitId: latestFolderCommit.id,
            targetCommitId: commit.id,
            tx
          });
          if (diff?.length > 0) {
            folderDiffs.set(folderId, diff);
          }
        }
      })
    );

    // Apply changes in hierarchical order
    const folderIds = Array.from(folderDiffs.keys());
    const folders = await folderDAL.findFoldersByRootAndIds({ rootId: targetCommit.folderId, folderIds }, tx);
    const sortedFolders = sortFoldersByHierarchy(folders);

    for (const folder of sortedFolders) {
      const diff = folderDiffs.get(folder.id);
      if (diff) {
        await applyFolderStateDifferences({
          differences: diff,
          actorInfo: {
            actorType,
            actorId,
            message: "Deep rollback"
          },
          folderId: folder.id,
          projectId,
          reconstructNewFolders: true,
          reconstructUpToCommit: targetCommit.commitId.toString(),
          tx
        });
      }
    }
  };

  // Return the public interface
  return {
    createCommit,
    addCommitChange,
    getCommitById,
    getCommitsByFolderId,
    getCommitChanges,
    getCheckpointsByFolderId,
    getLatestCheckpoint,
    initializeFolder,
    initializeProject,
    createFolderCheckpoint,
    compareFolderStates,
    applyFolderStateDifferences,
    createFolderTreeCheckpoint,
    deepRollbackFolder
  };
};

export type TFolderCommitServiceFactory = ReturnType<typeof folderCommitServiceFactory>;
