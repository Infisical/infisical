import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName,TSecretVersions } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

export type TSecretVersionDalFactory = ReturnType<typeof secretVersionDalFactory>;

export const secretVersionDalFactory = (db: TDbClient) => {
  const secretVersionOrm = ormify(db, TableName.SecretVersion);

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
        (prev, curr) => ({ ...prev, [curr.secretId]: curr }),
        {}
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestVersinMany" });
    }
  };

  return { ...secretVersionOrm, findLatestVersionMany };
};
