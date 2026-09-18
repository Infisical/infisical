import { Knex } from "knex";

import { TDbClient } from "@app/db";
import {
  TableName,
  TFolderCommitChanges,
  TFolderCommits,
  TProjectEnvironments,
  TSecretFolderVersions,
  TSecretVersionsV2
} from "@app/db/schemas";
import { DatabaseError, NotFoundError } from "@app/lib/errors";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { buildFindFilter, ormify, selectAllTableCols } from "@app/lib/knex";

export type TFolderCommitDALFactory = ReturnType<typeof folderCommitDALFactory>;

export type TFolderCommitChangeCount = {
  changeType: string;
  isUpdate: boolean;
  secretCount: number;
  folderCount: number;
  totalCount: number;
};

export const folderCommitDALFactory = (db: TDbClient) => {
  const folderCommitOrm = ormify(db, TableName.FolderCommit);
  const { delete: deleteOp, deleteById, ...restOfOrm } = folderCommitOrm;

  const findByFolderId = async (folderId: string, tx?: Knex): Promise<TFolderCommits[]> => {
    try {
      const trx = tx || db.replicaNode();

      // First, get all folder commits
      const folderCommits = await trx(TableName.FolderCommit)
        .where({ folderId })
        .select("*")
        .orderBy("createdAt", "desc");

      if (folderCommits.length === 0) return [];

      // Get all commit IDs
      const commitIds = folderCommits.map((commit) => commit.id);

      // Then get all related changes
      const changes = await trx(TableName.FolderCommitChanges).whereIn("folderCommitId", commitIds).select("*");

      const changesMap = changes.reduce(
        (acc, change) => {
          const { folderCommitId } = change;
          if (!acc[folderCommitId]) acc[folderCommitId] = [];
          acc[folderCommitId].push(change);
          return acc;
        },
        {} as Record<string, TFolderCommitChanges[]>
      );

      return folderCommits.map((commit) => ({
        ...commit,
        changes: changesMap[commit.id] || []
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderId" });
    }
  };

  const findLatestCommit = async (
    folderId: string,
    projectId?: string,
    tx?: Knex
  ): Promise<TFolderCommits | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where({ folderId })
        .leftJoin(TableName.Environment, function joinActiveEnvForFolderCommit() {
          this.on(`${TableName.FolderCommit}.envId`, `${TableName.Environment}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
        .where((qb) => {
          if (projectId) {
            void qb.where(`${TableName.Environment}.projectId`, "=", projectId);
          }
        })
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("commitId", "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestCommit" });
    }
  };

  const findLatestCommitByFolderIds = async (folderIds: string[], tx?: Knex): Promise<TFolderCommits[] | undefined> => {
    try {
      // First get max commitId for each folderId
      const maxCommitIdSubquery = (tx || db.replicaNode())(TableName.FolderCommit)
        .select("folderId")
        .max("commitId as maxCommitId")
        .whereIn("folderId", folderIds)
        .groupBy("folderId");

      // Join with main table to get complete records for each max commitId
      const docs = await (tx || db.replicaNode())(TableName.FolderCommit)
        .select(selectAllTableCols(TableName.FolderCommit))
        // eslint-disable-next-line func-names
        .join<TFolderCommits>(maxCommitIdSubquery.as("latest"), function () {
          this.on(`${TableName.FolderCommit}.folderId`, "=", "latest.folderId").andOn(
            `${TableName.FolderCommit}.commitId`,
            "=",
            "latest.maxCommitId"
          );
        });

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestCommitByFolderIds" });
    }
  };

  const findLatestEnvCommit = async (envId: string, tx?: Knex): Promise<TFolderCommits | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where(`${TableName.FolderCommit}.envId`, "=", envId)
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("commitId", "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestCommit" });
    }
  };

  const findMultipleLatestCommits = async (folderIds: string[], tx?: Knex): Promise<TFolderCommits[]> => {
    try {
      const knexInstance = tx || db.replicaNode();

      // Get the latest commitId for each folderId
      const subquery = knexInstance(TableName.FolderCommit)
        .whereIn("folderId", folderIds)
        .groupBy("folderId")
        .select("folderId")
        .max("commitId as maxCommitId");

      // Then fetch the complete rows matching those latest commits
      const docs = await knexInstance(TableName.FolderCommit)
        // eslint-disable-next-line func-names
        .innerJoin<TFolderCommits>(subquery.as("latest"), function () {
          this.on(`${TableName.FolderCommit}.folderId`, "=", "latest.folderId").andOn(
            `${TableName.FolderCommit}.commitId`,
            "=",
            "latest.maxCommitId"
          );
        })
        .select(selectAllTableCols(TableName.FolderCommit));

      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindMultipleLatestCommits" });
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

  const getEnvNumberOfCommitsSince = async (envId: string, folderCommitId: string, tx?: Knex): Promise<number> => {
    try {
      const referencedCommit = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where({ id: folderCommitId })
        .select("commitId")
        .first();

      if (referencedCommit?.commitId) {
        const doc = await (tx || db.replicaNode())(TableName.FolderCommit)
          .where(`${TableName.FolderCommit}.envId`, "=", envId)
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
    targetCommitNumber: bigint,
    checkpointCommitNumber: bigint,
    tx?: Knex
  ): Promise<
    (TFolderCommits & {
      changes: (TFolderCommitChanges & {
        referencedSecretId?: string;
        referencedFolderId?: string;
        folderName?: string;
        folderVersion?: string;
        secretKey?: string;
        secretVersion?: string;
      })[];
    })[]
  > => {
    try {
      // First get all the commits in the range
      const commits = await (tx || db.replicaNode())(TableName.FolderCommit)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ folderId }, TableName.FolderCommit))
        .andWhere(`${TableName.FolderCommit}.commitId`, ">", checkpointCommitNumber.toString())
        .andWhere(`${TableName.FolderCommit}.commitId`, "<=", targetCommitNumber.toString())
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
        .whereIn(`${TableName.FolderCommitChanges}.folderCommitId`, commitIds)
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
          db.ref("folderId").withSchema(TableName.SecretFolderVersion).as("referencedFolderId"),
          db.ref("name").withSchema(TableName.SecretFolderVersion).as("folderName"),
          db.ref("version").withSchema(TableName.SecretFolderVersion).as("folderVersion"),
          db.ref("key").withSchema(TableName.SecretVersionV2).as("secretKey"),
          db.ref("version").withSchema(TableName.SecretVersionV2).as("secretVersion")
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

  const findLatestCommitBetween = async ({
    folderId,
    startCommitId,
    endCommitId,
    tx
  }: {
    folderId: string;
    startCommitId?: string;
    endCommitId: string;
    tx?: Knex;
  }): Promise<TFolderCommits | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where("commitId", "<=", endCommitId)
        .where({ folderId })
        .where((qb) => {
          if (startCommitId) {
            void qb.where("commitId", ">=", startCommitId);
          }
        })
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("commitId", "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestCommitBetween" });
    }
  };

  const findAllCommitsBetween = async ({
    envId,
    startCommitId,
    endCommitId,
    tx
  }: {
    envId?: string;
    startCommitId?: string;
    endCommitId?: string;
    tx?: Knex;
  }): Promise<TFolderCommits[]> => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where((qb) => {
          if (envId) {
            void qb.where(`${TableName.FolderCommit}.envId`, "=", envId);
          }
          if (startCommitId) {
            void qb.where("commitId", ">=", startCommitId);
          }
          if (endCommitId) {
            void qb.where("commitId", "<=", endCommitId);
          }
        })
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("commitId", "desc");
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestCommitBetween" });
    }
  };

  const findAllFolderCommitsAfter = async ({
    envId,
    startCommitId,
    tx
  }: {
    envId?: string;
    startCommitId?: string;
    tx?: Knex;
  }): Promise<TFolderCommits[]> => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where((qb) => {
          if (envId) {
            void qb.where(`${TableName.FolderCommit}.envId`, "=", envId);
          }
          if (startCommitId) {
            void qb.where("commitId", ">=", startCommitId);
          }
        })
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("commitId", "desc");
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestCommitBetween" });
    }
  };

  const findPreviousCommitTo = async (
    folderId: string,
    commitId: string,
    tx?: Knex
  ): Promise<TFolderCommits | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where({ folderId })
        .where("commitId", "<=", commitId)
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("commitId", "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindPreviousCommitTo" });
    }
  };

  const findById = async (id: string, tx?: Knex, projectId?: string): Promise<TFolderCommits> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.FolderCommit)
        // eslint-disable-next-line @typescript-eslint/no-misused-promises
        .where(buildFindFilter({ id }, TableName.FolderCommit))
        .leftJoin<TProjectEnvironments>(TableName.Environment, function joinActiveEnvForFolderCommit() {
          this.on(`${TableName.FolderCommit}.envId`, `${TableName.Environment}.id`).andOnNull(
            `${TableName.Environment}.deleteAfter`
          );
        })
        .where((qb) => {
          if (projectId) {
            void qb.where(`${TableName.Environment}.projectId`, "=", projectId);
          }
        })
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("commitId", "desc")
        .first();
      if (!doc) {
        throw new NotFoundError({
          message: `Folder commit not found for ID ${id}`
        });
      }
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindById" });
    }
  };

  const findByFolderIdPaginated = async (
    folderId: string,
    options: {
      offset?: number;
      limit?: number;
      search?: string;
      sort?: "asc" | "desc";
      actorId?: string;
      actorType?: string;
    } = {},
    tx?: Knex
  ): Promise<{
    commits: (TFolderCommits & { changeCounts: TFolderCommitChangeCount[] })[];
    total: number;
    hasMore: boolean;
  }> => {
    try {
      const { offset = 0, limit = 20, search, sort = "desc", actorId, actorType } = options;
      const trx = tx || db.replicaNode();

      // Build base query
      let baseQuery = trx(TableName.FolderCommit).where(`${TableName.FolderCommit}.folderId`, folderId);

      if (actorType) {
        baseQuery = baseQuery.where(`${TableName.FolderCommit}.actorType`, actorType);
      }

      if (actorId) {
        baseQuery = baseQuery.whereRaw(`?? ->> 'id' = ?`, [`${TableName.FolderCommit}.actorMetadata`, actorId]);
      }

      // Search matches the commit message, its hash, its author, or the key/name of any
      // resource the commit touched
      if (search) {
        const sanitizedSearch = sanitizeSqlLikeString(search);
        const pattern = `%${sanitizedSearch}%`;
        baseQuery = baseQuery.where((qb) => {
          void qb
            .whereILike(`${TableName.FolderCommit}.message`, pattern)
            // The UI shows the leading 8 characters of the commit id, so match on prefix
            .orWhereRaw(`?? :: text ILIKE ?`, [`${TableName.FolderCommit}.id`, `${sanitizedSearch}%`])
            // Mirror the author label the UI renders: email, else name, else actor type
            .orWhereRaw(`COALESCE(NULLIF(?? ->> 'email', ''), NULLIF(?? ->> 'name', ''), ??) ILIKE ?`, [
              `${TableName.FolderCommit}.actorMetadata`,
              `${TableName.FolderCommit}.actorMetadata`,
              `${TableName.FolderCommit}.actorType`,
              pattern
            ])
            .orWhereExists((subQuery) => {
              void subQuery
                .select(trx.raw("1"))
                .from(TableName.FolderCommitChanges)
                .leftJoin(
                  TableName.SecretVersionV2,
                  `${TableName.FolderCommitChanges}.secretVersionId`,
                  `${TableName.SecretVersionV2}.id`
                )
                .leftJoin(
                  TableName.SecretFolderVersion,
                  `${TableName.FolderCommitChanges}.folderVersionId`,
                  `${TableName.SecretFolderVersion}.id`
                )
                .whereRaw(`?? = ??`, [
                  `${TableName.FolderCommitChanges}.folderCommitId`,
                  `${TableName.FolderCommit}.id`
                ])
                .where((resourceQb) => {
                  void resourceQb
                    .whereILike(`${TableName.SecretVersionV2}.key`, pattern)
                    .orWhereILike(`${TableName.SecretFolderVersion}.name`, pattern);
                });
            });
        });
      }

      // Get total count
      const totalResult = await baseQuery.clone().count("*", { as: "count" }).first();
      const total = Number(totalResult?.count || 0);

      // Get paginated commits
      const folderCommits = await baseQuery
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy(`${TableName.FolderCommit}.createdAt`, sort)
        .limit(limit)
        .offset(offset);

      if (folderCommits.length === 0) {
        return { commits: [], total, hasMore: false };
      }

      const commitIds = folderCommits.map((commit) => commit.id);

      // Counted in the database rather than by loading the rows: a single commit can carry
      // tens of thousands of changes (a bulk import, a folder delete), and the caller only
      // needs the totals. Grouping caps this at one row per change kind per commit.
      const countRows = await trx(TableName.FolderCommitChanges)
        .whereIn("folderCommitId", commitIds)
        .groupBy("folderCommitId", "changeType", "isUpdate")
        .select<
          {
            folderCommitId: string;
            changeType: string;
            isUpdate: boolean;
            secretCount: string;
            folderCount: string;
            totalCount: string;
          }[]
        >("folderCommitId", "changeType", "isUpdate", trx.raw(`COUNT(*) FILTER (WHERE "secretVersionId" IS NOT NULL) AS "secretCount"`), trx.raw(`COUNT(*) FILTER (WHERE "folderVersionId" IS NOT NULL) AS "folderCount"`), trx.raw(`COUNT(*) AS "totalCount"`));

      const countsMap = countRows.reduce(
        (acc, row) => {
          if (!acc[row.folderCommitId]) acc[row.folderCommitId] = [];
          acc[row.folderCommitId].push({
            changeType: row.changeType,
            isUpdate: row.isUpdate,
            secretCount: Number(row.secretCount),
            folderCount: Number(row.folderCount),
            totalCount: Number(row.totalCount)
          });
          return acc;
        },
        {} as Record<string, TFolderCommitChangeCount[]>
      );

      const commitsWithCounts = folderCommits.map((commit) => ({
        ...commit,
        changeCounts: countsMap[commit.id] || []
      }));

      const hasMore = offset + limit < total;

      return {
        commits: commitsWithCounts,
        total,
        hasMore
      };
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByFolderIdPaginated" });
    }
  };

  const findCommitAuthorsByFolderId = async (
    folderId: string,
    tx?: Knex
  ): Promise<{ actorId: string | null; actorType: string; name: string | null }[]> => {
    try {
      const trx = tx || db.replicaNode();

      // DISTINCT ON keeps the name from each author's most recent commit, so a renamed
      // user or identity is labelled with what it is called now rather than at first commit
      const { rows } = await trx.raw<{
        rows: { actorId: string | null; actorType: string; name: string | null }[];
      }>(
        `SELECT DISTINCT ON ("actorType", "actorMetadata" ->> 'id')
           "actorType",
           "actorMetadata" ->> 'id' AS "actorId",
           "actorMetadata" ->> 'name' AS "name"
         FROM ??
         WHERE "folderId" = ?
         ORDER BY "actorType", "actorMetadata" ->> 'id', "createdAt" DESC`,
        [TableName.FolderCommit, folderId]
      );

      return rows.map((row) => ({
        actorId: row.actorId ?? null,
        actorType: row.actorType,
        name: row.name ?? null
      }));
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCommitAuthorsByFolderId" });
    }
  };

  const findCommitBefore = async (
    folderId: string,
    commitId: bigint,
    tx?: Knex
  ): Promise<TFolderCommits | undefined> => {
    try {
      const doc = await (tx || db.replicaNode())(TableName.FolderCommit)
        .where({ folderId })
        .where("commitId", "<", commitId.toString())
        .select(selectAllTableCols(TableName.FolderCommit))
        .orderBy("commitId", "desc")
        .first();
      return doc;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindCommitBefore" });
    }
  };

  return {
    ...restOfOrm,
    findByFolderId,
    findLatestCommit,
    getNumberOfCommitsSince,
    findCommitsToRecreate,
    findMultipleLatestCommits,
    findAllCommitsBetween,
    findLatestCommitBetween,
    findLatestEnvCommit,
    getEnvNumberOfCommitsSince,
    findLatestCommitByFolderIds,
    findAllFolderCommitsAfter,
    findPreviousCommitTo,
    findById,
    findByFolderIdPaginated,
    findCommitAuthorsByFolderId,
    findCommitBefore
  };
};
