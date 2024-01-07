import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretVersions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretVersionDalFactory = ReturnType<typeof secretVersionDalFactory>;

export const secretVersionDalFactory = (db: TDbClient) => {
  const secretVersionOrm = ormify(db, TableName.SecretVersion);

  // This will fetch all latest secret versions from a folder
  const findLatestVersionByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db)(TableName.SecretVersion)
        .where(`${TableName.SecretVersion}.folderId`, folderId)
        .join(TableName.Secret, `${TableName.Secret}.id`, `${TableName.SecretVersion}.secretId`)
        .join<TSecretVersions, TSecretVersions & { secretId: string; max: number }>(
          (tx || db)(TableName.SecretVersion)
            .groupBy("folderId", "secretId")
            .max("version")
            .select("secretId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.SecretVersion}.secretId`, "latestVersion.secretId").andOn(
              `${TableName.SecretVersion}.version`,
              "latestVersion.max"
            );
          }
        )
        .select(selectAllTableCols(TableName.SecretVersion));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestVersionByFolderId" });
    }
  };

  const findLatestVersionMany = async (folderId: string, secretIds: string[], tx?: Knex) => {
    try {
      const docs: Array<TSecretVersions & { max: number }> = await (tx || db)(
        TableName.SecretVersion
      )
        .where("folderId", folderId)
        .whereIn(`${TableName.SecretVersion}.secretId`, secretIds)
        .join(
          (tx || db)(TableName.SecretVersion)
            .groupBy("secretId")
            .max("version")
            .select("secretId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.SecretVersion}.secretId`, "latestVersion.secretId").andOn(
              `${TableName.SecretVersion}.version`,
              "latestVersion.max"
            );
          }
        );
      return docs.reduce<Record<string, TSecretVersions>>(
        (prev, curr) => ({ ...prev, [curr.secretId || ""]: curr }),
        {}
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestVersinMany" });
    }
  };

  return { ...secretVersionOrm, findLatestVersionMany, findLatestVersionByFolderId };
};
