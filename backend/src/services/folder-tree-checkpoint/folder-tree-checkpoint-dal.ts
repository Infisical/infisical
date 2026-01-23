import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TFolderCommits } from "@app/db/schemas/folder-commits";
import { TFolderTreeCheckpoints } from "@app/db/schemas/folder-tree-checkpoints";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderTreeCheckpointDALFactory = ReturnType<typeof folderTreeCheckpointDALFactory>;

type TreeCheckpointWithCommitInfo = TFolderTreeCheckpoints & {
  commitId: bigint;
};

export const folderTreeCheckpointDALFactory = (db: TDbClient) => {
  const folderTreeCheckpointOrm = ormify(db, TableName.FolderTreeCheckpoint);

  const findByCommitId = async (folderCommitId: string, tx?: Knex): Promise<TFolderTreeCheckpoints | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())<TFolderTreeCheckpoints>(TableName.FolderTreeCheckpoint)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ folderCommitId }, TableName.FolderTreeCheckpoint))
        .select(selectAllTableCols(TableName.FolderTreeCheckpoint))
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByCommitId" });
    }
  };

  const findNearestCheckpoint = async (
    folderCommitId: bigint,
    envId: string,
    tx?: Knex
  ): Promise<TreeCheckpointWithCommitInfo | undefined> => {
    try {
      const nearestCheckpoint = await (tx || db.replicaNode())(TableName.FolderTreeCheckpoint)
        .join<TFolderCommits>(
          TableName.FolderCommit,
          `${TableName.FolderTreeCheckpoint}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(`${TableName.FolderCommit}.envId`, "=", envId)
        .andWhere(`${TableName.FolderCommit}.commitId`, "<=", folderCommitId.toString())
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
        .where(`${TableName.FolderCommit}.envId`, "=", envId)
        .orderBy(`${TableName.FolderTreeCheckpoint}.createdAt`, "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestByEnvId" });
    }
  };

  return {
    ...folderTreeCheckpointOrm,
    findByCommitId,
    findNearestCheckpoint,
    findLatestByEnvId
  };
};
