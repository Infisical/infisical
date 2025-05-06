import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TFolderCommits } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderCommitDALFactory = ReturnType<typeof folderCommitDALFactory>;

export const folderCommitDALFactory = (db: TDbClient) => {
  const folderCommitOrm = ormify(db, TableName.FolderCommit);
  const { delete: deleteOp, deleteById, ...restOfOrm } = folderCommitOrm;

  const findByFolderId = async (folderId: string, tx?: Knex): Promise<TFolderCommits[]> => {
    try {
      const docs = await (tx || db.replicaNode())<TFolderCommits>(TableName.FolderCommit)
        .where({ folderId })
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("date", "desc");
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderId" });
    }
  };

  const findById = async (id: string, tx?: Knex): Promise<TFolderCommits | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())<TFolderCommits>(TableName.FolderCommit)
        .where({ id })
        .select(selectAllTableCols(TableName.FolderCommit))
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const findLatestCommit = async (folderId: string, tx?: Knex): Promise<TFolderCommits | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())<TFolderCommits>(TableName.FolderCommit)
        .where({ folderId })
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("date", "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestCommit" });
    }
  };

  return {
    ...restOfOrm,
    findByFolderId,
    findById,
    findLatestCommit
  };
};
