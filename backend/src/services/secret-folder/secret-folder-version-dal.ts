import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretFolderVersions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { logger } from "@app/lib/logger";
import { QueueName } from "@app/queue";

export type TSecretFolderVersionDALFactory = ReturnType<typeof secretFolderVersionDALFactory>;

export const secretFolderVersionDALFactory = (db: TDbClient) => {
  const secretFolderVerOrm = ormify(db, TableName.SecretFolderVersion);

  // This will fetch all latest secret versions from a folder
  const findLatestVersionByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretFolderVersion)
        .join(TableName.SecretFolder, `${TableName.SecretFolderVersion}.folderId`, `${TableName.SecretFolder}.id`)
        .where({ parentId: folderId, isReserved: false })
        .join<TSecretFolderVersions>(
          (tx || db)(TableName.SecretFolderVersion)
            .groupBy("envId", "folderId")
            .max("version")
            .select("folderId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.SecretFolderVersion}.folderId`, "latestVersion.folderId").andOn(
              `${TableName.SecretFolderVersion}.version`,
              "latestVersion.max"
            );
          }
        )
        .select(selectAllTableCols(TableName.SecretFolderVersion));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestVersionByFolderId" });
    }
  };

  const findLatestFolderVersions = async (folderIds: string[], tx?: Knex) => {
    try {
      const docs: Array<TSecretFolderVersions & { max: number }> = await (tx || db.replicaNode())(
        TableName.SecretFolderVersion
      )
        .whereIn(`${TableName.SecretFolderVersion}.folderId`, folderIds)
        .join(
          (tx || db)(TableName.SecretFolderVersion)
            .groupBy("folderId")
            .max("version")
            .select("folderId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.SecretFolderVersion}.folderId`, "latestVersion.folderId").andOn(
              `${TableName.SecretFolderVersion}.version`,
              "latestVersion.max"
            );
          }
        );
      return docs.reduce<Record<string, TSecretFolderVersions>>(
        (prev, curr) => ({ ...prev, [curr.folderId || ""]: curr }),
        {}
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestFolderVersions" });
    }
  };

  const pruneExcessVersions = async () => {
    logger.info(`${QueueName.DailyResourceCleanUp}: pruning secret folder versions started`);
    try {
      await db(TableName.SecretFolderVersion)
        .with("folder_cte", (qb) => {
          void qb
            .from(TableName.SecretFolderVersion)
            .select(
              "id",
              "folderId",
              db.raw(
                `ROW_NUMBER() OVER (PARTITION BY ${TableName.SecretFolderVersion}."folderId" ORDER BY ${TableName.SecretFolderVersion}."createdAt" DESC) AS row_num`
              )
            );
        })
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolderVersion}.envId`)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Environment}.projectId`)
        .join("folder_cte", "folder_cte.id", `${TableName.SecretFolderVersion}.id`)
        .whereRaw(`folder_cte.row_num > ${TableName.Project}."pitVersionLimit"`)
        .andWhere(`${TableName.Project}.version`, "<", 3)
        .delete();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Secret Folder Version Prune"
      });
    }
    logger.info(`${QueueName.DailyResourceCleanUp}: pruning secret folder versions completed`);
  };

  const findByIdsWithLatestVersion = async (folderIds: string[], versionIds?: string[], tx?: Knex) => {
    try {
      if (!folderIds.length && (!versionIds || !versionIds.length)) return {};

      const knexInstance = tx || db.replicaNode();
      let allDocs: Array<TSecretFolderVersions & { max?: number }> = [];

      // Process latest versions for folderIds
      if (folderIds.length) {
        const latestVersions: Array<TSecretFolderVersions & { max: number }> = await knexInstance(
          TableName.SecretFolderVersion
        )
          .whereIn(`${TableName.SecretFolderVersion}.folderId`, folderIds)
          .join(
            knexInstance(TableName.SecretFolderVersion)
              .groupBy("folderId")
              .max("version")
              .select("folderId")
              .as("latestVersion"),
            (bd) => {
              bd.on(`${TableName.SecretFolderVersion}.folderId`, "latestVersion.folderId").andOn(
                `${TableName.SecretFolderVersion}.version`,
                "latestVersion.max"
              );
            }
          );

        allDocs = [...allDocs, ...latestVersions];
      }

      // Process specific versions by versionIds
      if (versionIds && versionIds.length) {
        // Get the specific versions
        const specificVersions = await knexInstance(TableName.SecretFolderVersion).whereIn("id", versionIds);

        // Get the folderIds from these versions
        const specificFolderIds = [...new Set(specificVersions.map((v) => v.folderId).filter(Boolean))];

        // Get max versions for these folderIds
        const maxVersionsQuery = (await knexInstance(TableName.SecretFolderVersion)
          .whereIn("folderId", specificFolderIds)
          .groupBy("folderId")
          .select("folderId")
          .max("version as max")) as Array<{ folderId: string; max: number }>;

        // Create a lookup map for max versions
        const maxVersionMap = maxVersionsQuery.reduce<Record<string, number>>((acc, item) => {
          acc[item.folderId] = item.max;
          return acc;
        }, {});

        // Add max version to each specific version
        const specificVersionsWithMax = specificVersions.map((version) => ({
          ...version,
          max: maxVersionMap[version.folderId]
        }));

        allDocs = [...allDocs, ...specificVersionsWithMax];
      }

      return allDocs.reduce<Record<string, TSecretFolderVersions & { max?: number }>>(
        (prev, curr) => ({ ...prev, [curr.folderId || ""]: curr }),
        {}
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindByIdsWithLatestVersion" });
    }
  };

  return {
    ...secretFolderVerOrm,
    findLatestFolderVersions,
    findLatestVersionByFolderId,
    pruneExcessVersions,
    findByIdsWithLatestVersion
  };
};
