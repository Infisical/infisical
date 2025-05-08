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
import { TSecretVersionV2DALFactory } from "../secret-v2-bridge/secret-version-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TFolderCommitDALFactory } from "./folder-commit-dal";

type TFolderCommitServiceFactoryDep = {
  folderCommitDAL: Pick<
    TFolderCommitDALFactory,
    "create" | "findById" | "findByFolderId" | "findLatestCommit" | "transaction" | "getNumberOfCommitsSince"
  >;
  folderCommitChangesDAL: Pick<TFolderCommitChangesDALFactory, "create" | "findByCommitId" | "insertMany">;
  folderCheckpointDAL: Pick<TFolderCheckpointDALFactory, "create" | "findByFolderId" | "findLatestByFolderId">;
  folderCheckpointResourcesDAL: Pick<TFolderCheckpointResourcesDALFactory, "insertMany">;
  folderTreeCheckpointDAL: Pick<TFolderTreeCheckpointDALFactory, "findByProjectId" | "findLatestByProjectId">;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
  folderDAL: Pick<TSecretFolderDALFactory, "findByParentId" | "findByProjectId">;
  folderVersionDAL: Pick<TSecretFolderVersionDALFactory, "findLatestFolderVersions">;
  secretVersionV2BridgeDAL: Pick<TSecretVersionV2DALFactory, "findLatestVersionByFolderId">;
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
  projectDAL
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
    if (!latestCommitId) {
      latestCommitId = (await folderCheckpointDAL.findLatestByFolderId(folderId, tx))?.folderCommitId;
    }
    if (!latestCommitId) {
      throw new BadRequestError({ message: "Latest commit ID not found" });
      return;
    }
    if (!force) {
      const commitsSinceLastCheckpoint = await folderCommitDAL.getNumberOfCommitsSince(folderId, latestCommitId, tx);
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

      await createFolderCheckpoint({ folderId: data.folderId, folderCommitId: newCommit.id, tx });
      return newCommit;
    } catch (error) {
      throw new DatabaseError({ error, name: "CreateCommit" });
    }
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
    createFolderCheckpoint
  };
};

export type TFolderCommitServiceFactory = ReturnType<typeof folderCommitServiceFactory>;
