import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TSecretFolderVersions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretFolderVersionDalFactory = ReturnType<typeof secretFolderVersionDalFactory>;

export const secretFolderVersionDalFactory = (db: TDbClient) => {
  const secretFolderVerOrm = ormify(db, TableName.SecretFolderVersion);

  // This will fetch all latest secret versions from a folder
  const findLatestVersionByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db)(TableName.SecretFolderVersion)
        .join(
          TableName.SecretFolder,
          `${TableName.SecretFolderVersion}.folderId`,
          `${TableName.SecretFolder}.id`
        )
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
      const docs: Array<TSecretFolderVersions & { max: number }> = await (tx || db)(
        TableName.SecretFolderVersion
      )
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

  return { ...secretFolderVerOrm, findLatestFolderVersions, findLatestVersionByFolderId };
};
