import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TFolderCommitChanges,
  TFolderCommits,
  TSecretFolderVersions,
  TSecretVersionsV2
} from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

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

  const findCommitsToRecreate = async (
    folderId: string,
    targetCommitNumber: number,
    checkpointCommitNumber: number,
    tx?: Knex
  ): Promise<
    (TFolderCommits & {
      changes: (TFolderCommitChanges & { referencedSecretId?: string; referencedFolderId?: string })[];
    })[]
  > => {
    try {
      // First get all the commits in the range
      const commits = await (tx || db.replicaNode())(TableName.FolderCommit)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ folderId }, TableName.FolderCommit))
        .andWhere(`${TableName.FolderCommit}.commitId`, ">", checkpointCommitNumber)
        .andWhere(`${TableName.FolderCommit}.commitId`, "<=", targetCommitNumber)
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy(`${TableName.FolderCommit}.commitId`, "asc");

      // If no commits found, return empty array
      if (!commits.length) {
        return [];
      }

      // Get all the commit IDs
      const commitIds = commits.map((commit) => commit.id);

      // Get all changes for these commits in a single query
      const allChanges = await (tx || db.replicaNode())(TableName.FolderCommitChanges)
        .whereIn("folderCommitId", commitIds)
        .leftJoin<TSecretVersionsV2>(
          TableName.SecretVersionV2,
          `${TableName.FolderCommitChanges}.secretVersionId`,
          `${TableName.SecretVersionV2}.id`
        )
        .leftJoin<TSecretFolderVersions>(
          TableName.SecretFolderVersion,
          `${TableName.FolderCommitChanges}.folderVersionId`,
          `${TableName.SecretFolderVersion}.id`
        )
        .select(selectAllTableCols(TableName.FolderCommitChanges))
        .select(
          db.ref("secretId").withSchema(TableName.SecretVersionV2).as("referencedSecretId"),
          db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("referencedFolderId")
        );

      // Organize changes by commit ID
      const changesByCommitId = allChanges.reduce(
        (acc, change) => {
          if (!acc[change.folderCommitId]) {
            acc[change.folderCommitId] = [];
          }
          acc[change.folderCommitId].push(change);
          return acc;
        },
        {} as Record<string, TFolderCommitChanges[]>
      );

      // Attach changes to each commit
      return commits.map((commit) => ({
        ...commit,
        changes: changesByCommitId[commit.id] || []
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCommitsToRecreate" });
    }
  };

  return {
    ...restOfOrm,
    findByFolderId,
    findLatestCommit,
    getNumberOfCommitsSince,
    findCommitsToRecreate
  };
};
