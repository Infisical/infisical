import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TFolderCommitChanges, TFolderCommits } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderCommitChangesDALFactory = ReturnType<typeof folderCommitChangesDALFactory>;

type CommitChangeWithCommitInfo = TFolderCommitChanges & {
  actorName: string;
  actorType: string;
  message: string | null;
  date: Date;
  folderId: string;
};

export const folderCommitChangesDALFactory = (db: TDbClient) => {
  const folderCommitChangesOrm = ormify<TFolderCommitChanges>(db, TableName.FolderCommitChanges);

  const findByCommitId = async (folderCommitId: string, tx?: Knex): Promise<TFolderCommitChanges[]> => {
    try {
      const docs = await (tx || db.replicaNode())<TFolderCommitChanges>(TableName.FolderCommitChanges)
        .where({ folderCommitId })
        .select(selectAllTableCols(TableName.FolderCommitChanges));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByCommitId" });
    }
  };

  const findBySecretVersionId = async (secretVersionId: string, tx?: Knex): Promise<CommitChangeWithCommitInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCommitChanges & Pick<TFolderCommits, "actorName" | "actorType" | "message" | "date" | "folderId">
      >(TableName.FolderCommitChanges)
        .where({ secretVersionId })
        .select(selectAllTableCols(TableName.FolderCommitChanges))
        .join(TableName.FolderCommit, `${TableName.FolderCommitChanges}.folderCommitId`, `${TableName.FolderCommit}.id`)
        .select(
          db.ref("actorName").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("date").withSchema(TableName.FolderCommit),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindBySecretVersionId" });
    }
  };

  const findByFolderVersionId = async (folderVersionId: string, tx?: Knex): Promise<CommitChangeWithCommitInfo[]> => {
    try {
      const docs = await (tx || db.replicaNode())<
        TFolderCommitChanges & Pick<TFolderCommits, "actorName" | "actorType" | "message" | "date" | "folderId">
      >(TableName.FolderCommitChanges)
        .where({ folderVersionId })
        .select(selectAllTableCols(TableName.FolderCommitChanges))
        .join(TableName.FolderCommit, `${TableName.FolderCommitChanges}.folderCommitId`, `${TableName.FolderCommit}.id`)
        .select(
          db.ref("actorName").withSchema(TableName.FolderCommit),
          db.ref("actorType").withSchema(TableName.FolderCommit),
          db.ref("message").withSchema(TableName.FolderCommit),
          db.ref("date").withSchema(TableName.FolderCommit),
          db.ref("folderId").withSchema(TableName.FolderCommit)
        );
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderVersionId" });
    }
  };

  return {
    ...folderCommitChangesOrm,
    findByCommitId,
    findBySecretVersionId,
    findByFolderVersionId
  };
};
