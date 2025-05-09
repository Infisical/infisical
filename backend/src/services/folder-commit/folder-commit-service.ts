/* eslint-disable no-await-in-loop */
import { Knex } from "knex";

import { TSecretFolders } from "@app/db/schemas";
import { getConfig } from "@app/lib/config/env";
import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";

import { ActorType } from "../auth/auth-type";
import { TFolderCheckpointDALFactory } from "../folder-checkpoint/folder-checkpoint-dal";
import { TFolderCheckpointResourcesDALFactory } from "../folder-checkpoint-resources/folder-checkpoint-resources-dal";
import { TFolderCommitChangesDALFactory } from "../folder-commit-changes/folder-commit-changes-dal";
import { TFolderTreeCheckpointDALFactory } from "../folder-tree-checkpoint/folder-tree-checkpoint-dal";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TProjectDALFactory } from "../project/project-dal";
import { TSecretFolderDALFactory } from "../secret-folder/secret-folder-dal";
import { TSecretFolderVersionDALFactory } from "../secret-folder/secret-folder-version-dal";
import { TSecretV2BridgeDALFactory } from "../secret-v2-bridge/secret-v2-bridge-dal";
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TFolderCommitDALFactory } from "./folder-commit-dal";

type TFolderCommitServiceFactoryDep = {
  folderCommitDAL: Pick<
    TFolderCommitDALFactory,
    | "create"
    | "findById"
    | "findByFolderId"
    | "findLatestCommit"
    | "transaction"
    | "getNumberOfCommitsSince"
    | "findCommitsToRecreate"
  >;
  folderCommitChangesDAL: Pick<TFolderCommitChangesDALFactory, "create" | "findByCommitId" | "insertMany">;
  folderCheckpointDAL: Pick<
    TFolderCheckpointDALFactory,
    "create" | "findByFolderId" | "findLatestByFolderId" | "findNearestCheckpoint"
  >;
  folderCheckpointResourcesDAL: Pick<TFolderCheckpointResourcesDALFactory, "insertMany" | "findByCheckpointId">;
  folderTreeCheckpointDAL: Pick<TFolderTreeCheckpointDALFactory, "findByProjectId" | "findLatestByProjectId">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  folderDAL: Pick<
    TSecretFolderDALFactory,
    "findByParentId" | "findByProjectId" | "deleteById" | "create" | "updateById" | "update"
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
    TSecretV2BridgeDALFactory,
    "deleteById" | "create" | "updateById" | "update" | "insertMany" | "invalidateSecretCacheByProjectId"
  >;
  projectDAL: Pick<TProjectDALFactory, "findById">;
};

export type TCreateCommitDTO = {
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

export type TCommitChangeDTO = {
  folderCommitId: string;
  changeType: string;
  secretVersionId?: string;
  folderVersionId?: string;
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
  secretV2BridgeDAL
}: TFolderCommitServiceFactoryDep) => {
  const appCfg = getConfig();

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
      latestCommitId = (await folderCommitDAL.findLatestCommit(folderId, tx))?.id;
    }
    if (!latestCommitId) {
      throw new BadRequestError({ message: "Latest commit ID not found" });
      return;
    }
    if (!force && latestCheckpoint) {
      const commitsSinceLastCheckpoint = await folderCommitDAL.getNumberOfCommitsSince(
        folderId,
        latestCheckpoint.folderCommitId,
        tx
      );
      if (commitsSinceLastCheckpoint < Number(appCfg.CHECKPOINT_WINDOW)) {
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
  };

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

  const compareFolderStates = async (currentCommitId: string, targetCommitId: string, tx?: Knex) => {
    // Reconstruct state for both commits
    const currentState = await reconstructFolderState(currentCommitId, tx);
    const targetState = await reconstructFolderState(targetCommitId, tx);

    // Create lookup maps for easier comparison
    const currentMap: Record<string, { type: string; id: string; versionId: string }> = {};
    const targetMap: Record<string, { type: string; id: string; versionId: string }> = {};

    // Build lookup map for current state
    currentState.forEach((resource) => {
      const key = `${resource.type}-${resource.id}`;
      currentMap[key] = resource;
    });

    // Build lookup map for target state
    targetState.forEach((resource) => {
      const key = `${resource.type}-${resource.id}`;
      targetMap[key] = resource;
    });

    // Track differences
    const differences: {
      type: string;
      id: string;
      versionId: string;
      changeType: "create" | "update" | "delete";
    }[] = [];

    // Find deletes and updates (resources in current but not in target, or with different versions)
    Object.keys(currentMap).forEach((key) => {
      const currentResource = currentMap[key];
      const targetResource = targetMap[key];

      if (!targetResource) {
        // Resource exists in current but not in target - it's a delete
        differences.push({
          type: currentResource.type,
          id: currentResource.id,
          versionId: currentResource.versionId,
          changeType: "delete"
        });
      } else if (currentResource.versionId !== targetResource.versionId) {
        // Resource exists in both but with different versions - it's an update
        differences.push({
          type: targetResource.type,
          id: targetResource.id,
          versionId: targetResource.versionId,
          changeType: "update"
        });
      }
      // If versions are the same, it's unchanged - exclude from result
    });

    // Find creates (resources in target but not in current)
    Object.keys(targetMap).forEach((key) => {
      if (!currentMap[key]) {
        const targetResource = targetMap[key];
        differences.push({
          type: targetResource.type,
          id: targetResource.id,
          versionId: targetResource.versionId,
          changeType: "create"
        });
      }
    });

    return differences;
  };

  // Add a change to an existing commit
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

  const createCommit = async (data: TCreateCommitDTO, tx?: Knex) => {
    const metadata = data.actor.metadata || {};
    try {
      if (data.actor.type === ActorType.USER && data.actor.metadata?.id) {
        const user = await userDAL.findById(data.actor.metadata?.id, tx);
        metadata.name = user?.username;
      }
      if (data.actor.type === ActorType.IDENTITY && data.actor.metadata?.id) {
        const identity = await identityDAL.findById(data.actor.metadata?.id, tx);
        metadata.name = identity?.name;
      }
      const newCommit = await folderCommitDAL.create(
        {
          actorMetadata: metadata,
          actorType: data.actor.type,
          message: data.message,
          folderId: data.folderId
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
      return newCommit;
    } catch (error) {
      throw new DatabaseError({ error, name: "CreateCommit" });
    }
  };

  const applyFolderStateDifferences = async (
    differences: Array<{
      type: string;
      id: string;
      versionId: string;
      oldVersionId?: string;
      changeType: "create" | "update" | "delete";
    }>,
    actorInfo: {
      actorType: string;
      actorId?: string;
      message?: string;
    },
    folderId: string,
    projectId: string
  ) => {
    let result = {};
    await folderCommitDAL.transaction(async (tx) => {
      // Group differences by type for more efficient processing
      const secretChanges = differences.filter((diff) => diff.type === "secret");
      const folderChanges = differences.filter((diff) => diff.type === "folder");

      const secretVersions = await secretVersionV2BridgeDAL.findByIdsWithLatestVersion(
        folderId,
        secretChanges.map((diff) => diff.id),
        secretChanges.map((diff) => diff.versionId)
      );
      const folderVersions = await folderVersionDAL.findByIdsWithLatestVersion(
        folderChanges.map((diff) => diff.id),
        folderChanges.map((diff) => diff.versionId)
      );

      // Track all changes for commit recording
      const commitChanges = [];

      // Process secret changes
      for (const change of secretChanges) {
        const secretVersion = secretVersions[change.id];
        switch (change.changeType) {
          case "create":
            if (secretVersion) {
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
                type: "add",
                secretVersionId: newVersion.id
              });
            }
            break;

          case "update":
            // Update secret to specific version
            if (secretVersion) {
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
                type: "add",
                secretVersionId: newVersion.id
              });
            }
            break;

          case "delete":
            await secretV2BridgeDAL.deleteById(change.id, tx);

            commitChanges.push({
              type: "delete",
              secretVersionId: change.versionId
            });
            break;

          default:
            throw new BadRequestError({ message: `Unknown change type: ${change.changeType as string}` });
        }
      }

      // process folder changes
      for (const change of folderChanges) {
        const folderVersion = folderVersions[change.id];
        switch (change.changeType) {
          case "create":
            // Add new folder
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

              commitChanges.push({
                type: "add",
                folderVersionId: newFolderVersion.id
              });
            }
            break;

          case "update":
            // Update folder to specific version
            if (change.versionId) {
              await folderVersionDAL.findById(change.versionId, tx).then(async (versionDetails) => {
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
                    type: "add",
                    folderVersionId: newFolderVersion.id
                  });
                }
              });
            }
            break;

          case "delete":
            await folderDAL.deleteById(change.id, tx);

            commitChanges.push({
              type: "delete",
              folderVersionId: change.versionId
            });
            break;

          default:
            throw new BadRequestError({ message: `Unknown change type: ${change.changeType as string}` });
        }
      }

      await createCommit(
        {
          actor: {
            type: actorInfo.actorType,
            metadata: { id: actorInfo.actorId }
          },
          message: actorInfo.message || "Rolled back folder state",
          folderId,
          changes: commitChanges
        },
        tx
      );

      result = {
        secretChangesCount: secretChanges.length,
        folderChangesCount: folderChanges.length,
        totalChanges: differences.length
      };
      await secretV2BridgeDAL.invalidateSecretCacheByProjectId(projectId);
    });

    return result;
  };

  // Retrieve a commit by ID
  const getCommitById = async (id: string, tx?: Knex) => {
    return folderCommitDAL.findById(id, tx);
  };

  // Get all commits for a folder
  const getCommitsByFolderId = async (folderId: string, tx?: Knex) => {
    return folderCommitDAL.findByFolderId(folderId, tx);
  };

  // Get changes for a commit
  const getCommitChanges = async (commitId: string, tx?: Knex) => {
    return folderCommitChangesDAL.findByCommitId(commitId, tx);
  };

  // Get checkpoints for a folder
  const getCheckpointsByFolderId = async (folderId: string, limit?: number, tx?: Knex) => {
    return folderCheckpointDAL.findByFolderId(folderId, limit, tx);
  };

  // Get the latest checkpoint for a folder
  const getLatestCheckpoint = async (folderId: string, tx?: Knex) => {
    return folderCheckpointDAL.findLatestByFolderId(folderId, tx);
  };

  // Get tree checkpoints for a project
  const getTreeCheckpointsByProjectId = async (projectId: string, limit?: number, tx?: Knex) => {
    return folderTreeCheckpointDAL.findByProjectId(projectId, limit, tx);
  };

  // Get the latest tree checkpoint for a project
  const getLatestTreeCheckpoint = async (projectId: string, tx?: Knex) => {
    return folderTreeCheckpointDAL.findLatestByProjectId(projectId, tx);
  };

  const initializeFolder = async (folderId: string, tx?: Knex) => {
    const folderResources = await getFolderResources(folderId, tx);
    const changes = folderResources.map((resource) => ({ type: "add", ...resource }));
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

  function sortFoldersByHierarchy(folders: TSecretFolders[]) {
    // Create a map for quick lookup of children by parent ID
    const childrenMap: Map<string | null, TSecretFolders[]> = new Map();
    folders.forEach((folder) => {
      const { parentId } = folder;
      if (!childrenMap.has(parentId || null)) {
        childrenMap.set(parentId || null, []);
      }
      childrenMap.get(parentId || null)?.push(folder);
    });

    // Start with root folders (null parentId)
    const result = [];
    const rootFolders = childrenMap.get(null) || [];

    // Process each level of the hierarchy
    let currentLevel = rootFolders;
    result.push(...currentLevel);

    while (currentLevel.length > 0) {
      const nextLevel = [];

      for (const folder of currentLevel) {
        const children = childrenMap.get(folder.id) || [];
        nextLevel.push(...children);
      }

      result.push(...nextLevel);
      currentLevel = nextLevel;
    }

    return result;
  }

  const initializeProject = async (projectId: string, tx?: Knex) => {
    const project = await projectDAL.findById(projectId, tx);
    if (!project) {
      throw new NotFoundError({ message: `Project with ID ${projectId} not found` });
    }
    const folders = await folderDAL.findByProjectId(projectId, tx);
    const sortedFolders = sortFoldersByHierarchy(folders);
    await Promise.all(sortedFolders.map((folder) => initializeFolder(folder.id, tx)));
  };

  return {
    createCommit,
    addCommitChange,
    getCommitById,
    getCommitsByFolderId,
    getCommitChanges,
    getCheckpointsByFolderId,
    getLatestCheckpoint,
    getTreeCheckpointsByProjectId,
    getLatestTreeCheckpoint,
    initializeFolder,
    initializeProject,
    createFolderCheckpoint,
    compareFolderStates,
    applyFolderStateDifferences
  };
};

export type TFolderCommitServiceFactory = ReturnType<typeof folderCommitServiceFactory>;
