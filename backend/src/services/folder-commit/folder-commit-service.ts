import { Knex } from "knex";

import { BadRequestError, DatabaseError, NotFoundError } from "@app/lib/errors";

import { ActorType } from "../auth/auth-type";
import { TFolderCheckpointDALFactory } from "../folder-checkpoint/folder-checkpoint-dal";
import { TFolderCommitChangesDALFactory } from "../folder-commit-changes/folder-commit-changes-dal";
import { TFolderTreeCheckpointDALFactory } from "../folder-tree-checkpoint/folder-tree-checkpoint-dal";
import { TIdentityDALFactory } from "../identity/identity-dal";
import { TUserDALFactory } from "../user/user-dal";
import { TFolderCommitDALFactory } from "./folder-commit-dal";

type TFolderCommitServiceFactoryDep = {
  folderCommitDAL: Pick<
    TFolderCommitDALFactory,
    "create" | "findById" | "findByFolderId" | "findLatestCommit" | "transaction"
  >;
  folderCommitChangesDAL: Pick<TFolderCommitChangesDALFactory, "create" | "findByCommitId" | "insertMany">;
  folderCheckpointDAL: Pick<TFolderCheckpointDALFactory, "create" | "findByFolderId" | "findLatestByFolderId">;
  folderTreeCheckpointDAL: Pick<
    TFolderTreeCheckpointDALFactory,
    "create" | "findByProjectId" | "findLatestByProjectId"
  >;
  userDAL: Pick<TUserDALFactory, "findById">;
  identityDAL: Pick<TIdentityDALFactory, "findById">;
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
  userDAL,
  identityDAL
}: TFolderCommitServiceFactoryDep) => {
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
      for (const change of data.changes) {
        // eslint-disable-next-line no-await-in-loop
        await folderCommitChangesDAL.create(
          {
            folderCommitId: newCommit.id,
            changeType: change.type,
            secretVersionId: change.secretVersionId,
            folderVersionId: change.folderVersionId
          },
          tx
        );
      }

      return newCommit;
    } catch (error) {
      throw new DatabaseError({ error, name: "CreateCommit" });
    }
  };

  // Add a change to a commit and trigger checkpoints as needed
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

  return {
    createCommit,
    addCommitChange,
    getCommitById,
    getCommitsByFolderId,
    getCommitChanges,
    getCheckpointsByFolderId,
    getLatestCheckpoint,
    getTreeCheckpointsByProjectId,
    getLatestTreeCheckpoint
  };
};

export type TFolderCommitServiceFactory = ReturnType<typeof folderCommitServiceFactory>;
