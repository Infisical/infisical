import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretFolderVersions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretFolderVersionDALFactory = ReturnType<typeof secretFolderVersionDALFactory>;

export const secretFolderVersionDALFactory = (db: TDbClient) => {
  const secretFolderVerOrm = ormify(db, TableName.SecretFolderVersion);

  // This will fetch all latest secret versions from a folder
  const findLatestVersionByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db)(TableName.SecretFolderVersion)
        .join(TableName.SecretFolder, `${TableName.SecretFolderVersion}.folderId`, `${TableName.SecretFolder}.id`)
        .where({ parentId: folderId })
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
      const docs: Array<TSecretFolderVersions & { max: number }> = await (tx || db)(TableName.SecretFolderVersion)
        .whereIn("folderId", folderIds)
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

  const pruneExcessVersions = async (tx?: Knex) => {
    try {
      const rankedFolderVersions = (tx || db)(TableName.SecretFolderVersion)
        .select(
          "id",
          "folderId",
          (tx || db).raw(
            `ROW_NUMBER() OVER (PARTITION BY ${TableName.SecretFolderVersion}."folderId" ORDER BY ${TableName.SecretFolderVersion}."createdAt" DESC) AS row_num`
          )
        )
        .as("ranked_folder_versions");

      const folderLimits = (tx || db)(TableName.SecretFolderVersion)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolderVersion}.envId`)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Environment}.projectId`)
        .groupBy(`${TableName.SecretFolderVersion}.folderId`, `${TableName.Project}.pitVersionLimit`)
        .select("folderId", "pitVersionLimit")
        .as("folder_limits");

      const versionsToKeep = (tx || db)(rankedFolderVersions)
        .select("id")
        .from(rankedFolderVersions)
        .join(folderLimits, "folder_limits.folderId", "ranked_folder_versions.folderId")
        .whereRaw(`ranked_folder_versions.row_num <= folder_limits."pitVersionLimit"`);

      await (tx || db)(TableName.SecretFolderVersion).whereNotIn("id", versionsToKeep).delete();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Secret Version Prune"
      });
    }
  };

  return { ...secretFolderVerOrm, findLatestFolderVersions, findLatestVersionByFolderId, pruneExcessVersions };
};
