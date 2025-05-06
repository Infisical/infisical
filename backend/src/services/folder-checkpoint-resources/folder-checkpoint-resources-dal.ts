import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TFolderCheckpointResources, TFolderCheckpoints } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderCheckpointResourcesDALFactory = ReturnType<typeof folderCheckpointResourcesDALFactory>;

type ResourceWithCheckpointInfo = TFolderCheckpointResources & {
  folderCommitId: string;
  date: Date;
};

export const folderCheckpointResourcesDALFactory = (db: TDbClient) => {
  const folderCheckpointResourcesOrm = ormify<TFolderCheckpointResources>(db, TableName.FolderCheckpointResources);

  const findByCheckpointId = async (folderCheckpointId: string, tx?: Knex): Promise<TFolderCheckpointResources[]> => {
    try {
      const docs = await (tx || db.replicaNode())<TFolderCheckpointResources>(TableName.FolderCheckpointResources)
        .where({ folderCheckpointId })
        .select(selectAllTableCols(TableName.FolderCheckpointResources));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByCheckpointId" });
    }
  };

  const findBySecretVersionId = async (secretVersionId: string, tx?: Knex): Promise<ResourceWithCheckpointInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCheckpointResources & Pick<TFolderCheckpoints, "folderCommitId" | "date">
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
          db.ref("date").withSchema(TableName.FolderCheckpoint)
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindBySecretVersionId" });
    }
  };

  const findByFolderVersionId = async (folderVersionId: string, tx?: Knex): Promise<ResourceWithCheckpointInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCheckpointResources & Pick<TFolderCheckpoints, "folderCommitId" | "date">
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
          db.ref("date").withSchema(TableName.FolderCheckpoint)
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
