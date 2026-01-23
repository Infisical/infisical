import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TFolderCheckpoints } from "@app/db/schemas/folder-checkpoints";
import { TFolderCommits } from "@app/db/schemas/folder-commits";
import { TableName } from "@app/db/schemas/models";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

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
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ folderCommitId }, TableName.FolderCheckpoint))
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
        .join<TFolderCommits>(
          TableName.FolderCommit,
          `${TableName.FolderCheckpoint}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ folderId }, TableName.FolderCommit))
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

      return await query;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderId" });
    }
  };

  const findLatestByFolderId = async (folderId: string, tx?: Knex): Promise<CheckpointWithCommitInfo | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.FolderCheckpoint)
        .join<TFolderCommits>(
          TableName.FolderCommit,
          `${TableName.FolderCheckpoint}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ folderId }, TableName.FolderCommit))
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

  const findNearestCheckpoint = async (
    folderCommitId: bigint,
    folderId: string,
    tx?: Knex
  ): Promise<(CheckpointWithCommitInfo & { commitId: bigint }) | undefined> => {
    try {
      // Get the checkpoint with the highest commitId that's still less than or equal to our commit
      const nearestCheckpoint = await (tx || db.replicaNode())(TableName.FolderCheckpoint)
        .join<TFolderCommits>(
          TableName.FolderCommit,
          `${TableName.FolderCheckpoint}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        .where(`${TableName.FolderCommit}.folderId`, "=", folderId)
        .where(`${TableName.FolderCommit}.commitId`, "<=", folderCommitId.toString())
        .select(selectAllTableCols(TableName.FolderCheckpoint))
        .select(
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("commitId").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit).as("commitDate"),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        )
        .orderBy(`${TableName.FolderCommit}.commitId`, "desc")
        .first();
      return nearestCheckpoint;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindNearestCheckpoint" });
    }
  };

  return {
    ...folderCheckpointOrm,
    findByCommitId,
    findByFolderId,
    findLatestByFolderId,
    findNearestCheckpoint
  };
};
