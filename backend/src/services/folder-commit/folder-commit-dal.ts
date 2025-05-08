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
      const docs = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where({ folderId })
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("createdAt", "desc");
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderId" });
    }
  };

  const findLatestCommit = async (folderId: string, tx?: Knex): Promise<TFolderCommits | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where({ folderId })
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("commitId", "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestCommit" });
    }
  };

  const getNumberOfCommitsSince = async (folderId: string, folderCommitId: string, tx?: Knex): Promise<number> => {
    try {
      const referencedCommit = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where({ id: folderCommitId })
        .select("commitId")
        .first();

      if (referencedCommit?.commitId) {
        const doc = await (tx || db.replicaNode())(TableName.FolderCommit)
          .where({ folderId })
          .where("commitId", ">", referencedCommit.commitId)
          .count();
        return Number(doc?.[0].count);
      }
      return 0;
    } catch (error) {
      throw new DatabaseError({ error, name: "getNumberOfCommitsSince" });
    }
  };

  return {
    ...restOfOrm,
    findByFolderId,
    findLatestCommit,
    getNumberOfCommitsSince
  };
};
