import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretVersions, TSecretVersionsUpdate } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretVersionDALFactory = ReturnType<typeof secretVersionDALFactory>;

export const secretVersionDALFactory = (db: TDbClient) => {
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

  const bulkUpdate = async (
    data: Array<{ filter: Partial<TSecretVersions>; data: TSecretVersionsUpdate }>,
    tx?: Knex
  ) => {
    try {
      const secs = await Promise.all(
        data.map(async ({ filter, data: updateData }) => {
          const [doc] = await (tx || db)(TableName.SecretVersion)
            .where(filter)
            .update(updateData)
            // .increment("version", 1) // TODO: Is this really needed?
            .returning("*");
          if (!doc) throw new BadRequestError({ message: "Failed to update document" });
          return doc;
        })
      );
      return secs;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret" });
    }
  };

  const bulkUpdateNoVersionIncrement = async (
    data: Array<{ filter: Partial<TSecretVersions>; data: TSecretVersionsUpdate }>,
    tx?: Knex
  ) => {
    try {
      const secs = await Promise.all(
        data.map(async ({ filter, data: updateData }) => {
          const [doc] = await (tx || db)(TableName.SecretVersion).where(filter).update(updateData).returning("*");
          if (!doc) throw new BadRequestError({ message: "Failed to update document" });
          return doc;
        })
      );
      return secs;
    } catch (error) {
      throw new DatabaseError({ error, name: "bulk update secret" });
    }
  };

  const findLatestVersionMany = async (folderId: string, secretIds: string[], tx?: Knex) => {
    try {
      const docs: Array<TSecretVersions & { max: number }> = await (tx || db)(TableName.SecretVersion)
        .where("folderId", folderId)
        .whereIn(`${TableName.SecretVersion}.secretId`, secretIds)
        .join(
          (tx || db)(TableName.SecretVersion).groupBy("secretId").max("version").select("secretId").as("latestVersion"),
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

  return {
    ...secretVersionOrm,
    findLatestVersionMany,
    bulkUpdate,
    findLatestVersionByFolderId,
    bulkUpdateNoVersionIncrement
  };
};
