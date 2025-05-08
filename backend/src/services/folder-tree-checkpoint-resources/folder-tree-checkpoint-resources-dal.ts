import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TFolderTreeCheckpointResources,
  TFolderTreeCheckpoints,
  TProjectEnvironments,
  TSecretFolders
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderTreeCheckpointResourcesDALFactory = ReturnType<typeof folderTreeCheckpointResourcesDALFactory>;

type ResourceWithCheckpointInfo = TFolderTreeCheckpointResources & {
  folderCommitId: string;
};

type ResourceWithFolderInfo = TFolderTreeCheckpointResources & {
  name: string;
  parentId?: string | null;
  slug: string;
  envName: string;
};

export const folderTreeCheckpointResourcesDALFactory = (db: TDbClient) => {
  const folderTreeCheckpointResourcesOrm = ormify(db, TableName.FolderTreeCheckpointResources);

  const findByTreeCheckpointId = async (
    folderTreeCheckpointId: string,
    tx?: Knex
  ): Promise<TFolderTreeCheckpointResources[]> => {
    try {
      const docs = await (tx || db.replicaNode())<TFolderTreeCheckpointResources>(
        TableName.FolderTreeCheckpointResources
      )
        .where({ folderTreeCheckpointId })
        .select(selectAllTableCols(TableName.FolderTreeCheckpointResources));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByTreeCheckpointId" });
    }
  };

  const findByFolderId = async (folderId: string, tx?: Knex): Promise<ResourceWithCheckpointInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderTreeCheckpointResources & Pick<TFolderTreeCheckpoints, "folderCommitId" | "createdAt">
      >(TableName.FolderTreeCheckpointResources)
        .where({ folderId })
        .select(selectAllTableCols(TableName.FolderTreeCheckpointResources))
        .join(
          TableName.FolderTreeCheckpoint,
          `${TableName.FolderTreeCheckpointResources}.folderTreeCheckpointId`,
          `${TableName.FolderTreeCheckpoint}.id`
        )
        .select(
          db.ref("folderCommitId").withSchema(TableName.FolderTreeCheckpoint),
          db.ref("createdAt").withSchema(TableName.FolderTreeCheckpoint)
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderId" });
    }
  };

  const findByFolderCommitId = async (folderCommitId: string, tx?: Knex): Promise<TFolderTreeCheckpointResources[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderTreeCheckpointResources & Pick<TFolderTreeCheckpoints, "createdAt">
      >(TableName.FolderTreeCheckpointResources)
        .where({ folderCommitId })
        .select(selectAllTableCols(TableName.FolderTreeCheckpointResources))
        .join(
          TableName.FolderTreeCheckpoint,
          `${TableName.FolderTreeCheckpointResources}.folderTreeCheckpointId`,
          `${TableName.FolderTreeCheckpoint}.id`
        )
        .select(db.ref("createdAt").withSchema(TableName.FolderTreeCheckpoint));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderCommitId" });
    }
  };

  const findFoldersInTreeCheckpoint = async (
    folderTreeCheckpointId: string,
    tx?: Knex
  ): Promise<ResourceWithFolderInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderTreeCheckpointResources &
          Pick<TSecretFolders, "name" | "parentId"> &
          Pick<TProjectEnvironments, "slug"> & { envName: string }
      >(TableName.FolderTreeCheckpointResources)
        .where({ folderTreeCheckpointId })
        .select(selectAllTableCols(TableName.FolderTreeCheckpointResources))
        .join(
          TableName.SecretFolder,
          `${TableName.FolderTreeCheckpointResources}.folderId`,
          `${TableName.SecretFolder}.id`
        )
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .select(
          db.ref("name").withSchema(TableName.SecretFolder),
          db.ref("parentId").withSchema(TableName.SecretFolder),
          db.ref("slug").withSchema(TableName.Environment),
          db.ref("name").withSchema(TableName.Environment).as("envName")
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindFoldersInTreeCheckpoint" });
    }
  };

  return {
    ...folderTreeCheckpointResourcesOrm,
    findByTreeCheckpointId,
    findByFolderId,
    findByFolderCommitId,
    findFoldersInTreeCheckpoint
  };
};
