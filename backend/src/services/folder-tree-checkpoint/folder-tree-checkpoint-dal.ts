import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TFolderCommits, TFolderTreeCheckpoints } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderTreeCheckpointDALFactory = ReturnType<typeof folderTreeCheckpointDALFactory>;

type TreeCheckpointWithCommitInfo = TFolderTreeCheckpoints & {
  commitId: number;
};

export const folderTreeCheckpointDALFactory = (db: TDbClient) => {
  const folderTreeCheckpointOrm = ormify(db, TableName.FolderTreeCheckpoint);

  const findByCommitId = async (folderCommitId: string, tx?: Knex): Promise<TFolderTreeCheckpoints | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())<TFolderTreeCheckpoints>(TableName.FolderTreeCheckpoint)
        .where({ folderCommitId })
        .select(selectAllTableCols(TableName.FolderTreeCheckpoint))
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByCommitId" });
    }
  };

  const findNearestCheckpoint = async (
    folderCommitId: string,
    envId: string,
    tx?: Knex
  ): Promise<TreeCheckpointWithCommitInfo | undefined> => {
    try {
      const targetCommit = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where({ id: folderCommitId })
        .select("id", "commitId", "folderId", "envId")
        .first();

      if (!targetCommit) {
        return undefined;
      }

      const nearestCheckpoint = await (tx || db.replicaNode())(TableName.FolderTreeCheckpoint)
        .leftJoin<TFolderCommits>(
          TableName.FolderCommit,
          `${TableName.FolderTreeCheckpoint}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        .where(`${TableName.FolderCommit}.envId`, "=", targetCommit.envId)
        .select(selectAllTableCols(TableName.FolderTreeCheckpoint))
        .select(db.ref("commitId").withSchema(TableName.FolderCommit))
        .orderBy(`${TableName.FolderCommit}.commitId`, "desc")
        .first();

      return nearestCheckpoint;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindNearestCheckpoint" });
    }
  };

  const findLatestByEnvId = async (envId: string, tx?: Knex): Promise<TFolderTreeCheckpoints | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())<TFolderTreeCheckpoints>(TableName.FolderTreeCheckpoint)
        .join<TFolderCommits>(
          TableName.FolderCommit,
          `${TableName.FolderTreeCheckpoint}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        .where(`${TableName.FolderCommit}.envId`, envId)
        .orderBy(`${TableName.FolderTreeCheckpoint}.createdAt`, "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestByFolderId" });
    }
  };

  return {
    ...folderTreeCheckpointOrm,
    findByCommitId,
    findNearestCheckpoint,
    findLatestByEnvId
  };
};
