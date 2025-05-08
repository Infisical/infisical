import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TFolderCommits, TFolderTreeCheckpoints } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderTreeCheckpointDALFactory = ReturnType<typeof folderTreeCheckpointDALFactory>;

type TreeCheckpointWithCommitInfo = TFolderTreeCheckpoints & {
  actorMetadata: unknown;
  actorType: string;
  message?: string | null;
  commitDate: Date;
  folderId: string;
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

  const findByProjectId = async (
    projectId: string,
    limit?: number,
    tx?: Knex
  ): Promise<TreeCheckpointWithCommitInfo[]> => {
    try {
      const query = (tx || db.replicaNode())<
        TFolderTreeCheckpoints &
          Pick<TFolderCommits, "actorMetadata" | "actorType" | "message" | "folderId"> & { commitDate: Date }
      >(TableName.FolderTreeCheckpoint)
        .join(
          TableName.FolderCommit,
          `${TableName.FolderTreeCheckpoint}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        .join(TableName.SecretFolder, `${TableName.FolderCommit}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where({ projectId })
        .select(selectAllTableCols(TableName.FolderTreeCheckpoint))
        .select(
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit).as("commitDate"),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        )
        .orderBy(`${TableName.FolderTreeCheckpoint}.createdAt`, "desc");

      if (limit) {
        void query.limit(limit);
      }

      const docs = await query;
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByProjectId" });
    }
  };

  const findLatestByProjectId = async (
    projectId: string,
    tx?: Knex
  ): Promise<TreeCheckpointWithCommitInfo | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())<
        TFolderTreeCheckpoints &
          Pick<TFolderCommits, "actorMetadata" | "actorType" | "message" | "folderId"> & { commitDate: Date }
      >(TableName.FolderTreeCheckpoint)
        .join(
          TableName.FolderCommit,
          `${TableName.FolderTreeCheckpoint}.folderCommitId`,
          `${TableName.FolderCommit}.id`
        )
        .join(TableName.SecretFolder, `${TableName.FolderCommit}.folderId`, `${TableName.SecretFolder}.id`)
        .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
        .where({ projectId })
        .select(selectAllTableCols(TableName.FolderTreeCheckpoint))
        .select(
          db.ref("actorMetadata").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("createdAt").withSchema(TableName.FolderCommit).as("commitDate"),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        )
        .orderBy(`${TableName.FolderTreeCheckpoint}.createdAt`, "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestByProjectId" });
    }
  };

  return {
    ...folderTreeCheckpointOrm,
    findByCommitId,
    findByProjectId,
    findLatestByProjectId
  };
};
