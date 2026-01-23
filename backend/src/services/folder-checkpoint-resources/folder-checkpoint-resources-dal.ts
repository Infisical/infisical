import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TFolderCheckpointResources } from "@app/db/schemas/folder-checkpoint-resources";
import { TFolderCheckpoints } from "@app/db/schemas/folder-checkpoints";
import { TableName } from "@app/db/schemas/models";
import { TSecretFolderVersions } from "@app/db/schemas/secret-folder-versions";
import { TSecretVersionsV2 } from "@app/db/schemas/secret-versions-v2";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderCheckpointResourcesDALFactory = ReturnType<typeof folderCheckpointResourcesDALFactory>;

export type ResourceWithCheckpointInfo = TFolderCheckpointResources & {
  folderCommitId: string;
};

export const folderCheckpointResourcesDALFactory = (db: TDbClient) => {
  const folderCheckpointResourcesOrm = ormify(db, TableName.FolderCheckpointResources);

  const findByCheckpointId = async (
    folderCheckpointId: string,
    tx?: Knex
  ): Promise<
    (TFolderCheckpointResources & {
      referencedSecretId?: string;
      referencedFolderId?: string;
      folderName?: string;
      folderVersion?: string;
      secretKey?: string;
      secretVersion?: string;
    })[]
  > => {
    try {
      const docs = await (tx || db.replicaNode())<TFolderCheckpointResources>(TableName.FolderCheckpointResources)
        .where({ folderCheckpointId })
        .leftJoin<TSecretVersionsV2>(
          TableName.SecretVersionV2,
          `${TableName.FolderCheckpointResources}.secretVersionId`,
          `${TableName.SecretVersionV2}.id`
        )
        .leftJoin<TSecretFolderVersions>(
          TableName.SecretFolderVersion,
          `${TableName.FolderCheckpointResources}.folderVersionId`,
          `${TableName.SecretFolderVersion}.id`
        )
        .select(selectAllTableCols(TableName.FolderCheckpointResources))
        .select(
          db.ref("secretId").withSchema(TableName.SecretVersionV2).as("referencedSecretId"),
          db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("referencedFolderId"),
          db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderName"),
          db.ref("version").withSchema(TableName.SecretFolderVersion).as("folderVersion"),
          db.ref("key").withSchema(TableName.SecretVersionV2).as("secretKey"),
          db.ref("version").withSchema(TableName.SecretVersionV2).as("secretVersion")
        );
      return docs.map((doc) => ({
        ...doc,
        folderVersion: doc.folderVersion?.toString(),
        secretVersion: doc.secretVersion?.toString()
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByCheckpointId" });
    }
  };

  const findBySecretVersionId = async (secretVersionId: string, tx?: Knex): Promise<ResourceWithCheckpointInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCheckpointResources & Pick<TFolderCheckpoints, "folderCommitId" | "createdAt">
      >(TableName.FolderCheckpointResources)
        .where({ secretVersionId })
        .select(selectAllTableCols(TableName.FolderCheckpointResources))
        .join(
          TableName.FolderCheckpoint,
          `${TableName.FolderCheckpointResources}.folderCheckpointId`,
          `${TableName.FolderCheckpoint}.id`
        )
        .select(
          db.ref("folderCommitId").withSchema(TableName.FolderCheckpoint),
          db.ref("createdAt").withSchema(TableName.FolderCheckpoint)
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindBySecretVersionId" });
    }
  };

  const findByFolderVersionId = async (folderVersionId: string, tx?: Knex): Promise<ResourceWithCheckpointInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCheckpointResources & Pick<TFolderCheckpoints, "folderCommitId" | "createdAt">
      >(TableName.FolderCheckpointResources)
        .where({ folderVersionId })
        .select(selectAllTableCols(TableName.FolderCheckpointResources))
        .join(
          TableName.FolderCheckpoint,
          `${TableName.FolderCheckpointResources}.folderCheckpointId`,
          `${TableName.FolderCheckpoint}.id`
        )
        .select(
          db.ref("folderCommitId").withSchema(TableName.FolderCheckpoint),
          db.ref("createdAt").withSchema(TableName.FolderCheckpoint)
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderVersionId" });
    }
  };

  return {
    ...folderCheckpointResourcesOrm,
    findByCheckpointId,
    findBySecretVersionId,
    findByFolderVersionId
  };
};
