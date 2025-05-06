import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TFolderCheckpoints } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderCheckpointDALFactory = ReturnType<typeof folderCheckpointDALFactory>;

type CheckpointWithCommitInfo = TFolderCheckpoints & {
  actorMetadata: unknown;
  actorType: string;
  message?: string | null;
  commitDate: Date;
  folderId: string;
};

export const folderCheckpointDALFactory = (db: TDbClient) => {
  const folderCheckpointOrm = ormify(db, TableName.FolderCheckpoint);

  const findByCommitId = async (folderCommitId: string, tx?: Knex): Promise<TFolderCheckpoints | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())<TFolderCheckpoints>(TableName.FolderCheckpoint)
        .where({ folderCommitId })
        .select(selectAllTableCols(TableName.FolderCheckpoint))
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByCommitId" });
    }
  };

  const findByFolderId = async (folderId: string, limit?: number, tx?: Knex): Promise<CheckpointWithCommitInfo[]> => {
    try {
      let query = (tx || db.replicaNode())(TableName.FolderCheckpoint)
        .join(TableName.FolderCommit, `${TableName.FolderCheckpoint}.folderCommitId`, `${TableName.FolderCommit}.id`)
        .where({ folderId })
        .select(selectAllTableCols(TableName.FolderCheckpoint))
        .select(
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit).as("commitDate"),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        )
        .orderBy(`${TableName.FolderCheckpoint}.createdAt`, "desc");

      if (limit !== undefined) {
        query = query.limit(limit);
      }

      const docs = await query;
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderId" });
    }
  };

  const findLatestByFolderId = async (folderId: string, tx?: Knex): Promise<CheckpointWithCommitInfo | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.FolderCheckpoint)
        .join(TableName.FolderCommit, `${TableName.FolderCheckpoint}.folderCommitId`, `${TableName.FolderCommit}.id`)
        .where({ folderId })
        .select(selectAllTableCols(TableName.FolderCheckpoint))
        .select(
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit).as("commitDate"),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        )
        .orderBy(`${TableName.FolderCheckpoint}.createdAt`, "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestByFolderId" });
    }
  };

  return {
    ...folderCheckpointOrm,
    findByCommitId,
    findByFolderId,
    findLatestByFolderId
  };
};
