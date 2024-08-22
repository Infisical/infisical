import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretVersionsV2, TSecretVersionsV2Update } from "@app/db/schemas";
import { BadRequestError, DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretVersionV2DALFactory = ReturnType<typeof secretVersionV2BridgeDALFactory>;

export const secretVersionV2BridgeDALFactory = (db: TDbClient) => {
  const secretVersionV2Orm = ormify(db, TableName.SecretVersionV2);

  // This will fetch all latest secret versions from a folder
  const findLatestVersionByFolderId = async (folderId: string, tx?: Knex) => {
    try {
      const docs = await (tx || db.replicaNode())(TableName.SecretVersionV2)
        .where(`${TableName.SecretVersionV2}.folderId`, folderId)
        .join(TableName.SecretV2, `${TableName.SecretV2}.id`, `${TableName.SecretVersionV2}.secretId`)
        .join<TSecretVersionsV2, TSecretVersionsV2 & { secretId: string; max: number }>(
          (tx || db)(TableName.SecretVersionV2)
            .groupBy("folderId", "secretId")
            .max("version")
            .select("secretId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.SecretVersionV2}.secretId`, "latestVersion.secretId").andOn(
              `${TableName.SecretVersionV2}.version`,
              "latestVersion.max"
            );
          }
        )
        .select(selectAllTableCols(TableName.SecretVersionV2));
      return docs;
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestVersionByFolderId" });
    }
  };

  const bulkUpdate = async (
    data: Array<{ filter: Partial<TSecretVersionsV2>; data: TSecretVersionsV2Update }>,
    tx?: Knex
  ) => {
    try {
      const secs = await Promise.all(
        data.map(async ({ filter, data: updateData }) => {
          const [doc] = await (tx || db)(TableName.SecretVersionV2)
            .where(filter)
            .update(updateData)
            .increment("version", 1) // TODO: Is this really needed?
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

  const findLatestVersionMany = async (folderId: string, secretIds: string[], tx?: Knex) => {
    try {
      if (!secretIds.length) return {};
      const docs: Array<TSecretVersionsV2 & { max: number }> = await (tx || db.replicaNode())(TableName.SecretVersionV2)
        .where("folderId", folderId)
        .whereIn(`${TableName.SecretVersionV2}.secretId`, secretIds)
        .join(
          (tx || db)(TableName.SecretVersionV2)
            .groupBy("secretId")
            .max("version")
            .select("secretId")
            .as("latestVersion"),
          (bd) => {
            bd.on(`${TableName.SecretVersionV2}.secretId`, "latestVersion.secretId").andOn(
              `${TableName.SecretVersionV2}.version`,
              "latestVersion.max"
            );
          }
        );
      return docs.reduce<Record<string, TSecretVersionsV2>>(
        (prev, curr) => ({ ...prev, [curr.secretId || ""]: curr }),
        {}
      );
    } catch (error) {
      throw new DatabaseError({ error, name: "FindLatestVersinMany" });
    }
  };

  const pruneExcessVersions = async () => {
    try {
      await db(TableName.SecretVersionV2)
        .with("version_cte", (qb) => {
          void qb
            .from(TableName.SecretVersionV2)
            .select(
              "id",
              "folderId",
              db.raw(
                `ROW_NUMBER() OVER (PARTITION BY ${TableName.SecretVersionV2}."secretId" ORDER BY ${TableName.SecretVersionV2}."createdAt" DESC) AS row_num`
              )
            );
        })
        .join(TableName.SecretFolder, `${TableName.SecretFolder}.id`, `${TableName.SecretVersionV2}.folderId`)
        .join(TableName.Environment, `${TableName.Environment}.id`, `${TableName.SecretFolder}.envId`)
        .join(TableName.Project, `${TableName.Project}.id`, `${TableName.Environment}.projectId`)
        .join("version_cte", "version_cte.id", `${TableName.SecretVersionV2}.id`)
        .whereRaw(`version_cte.row_num > ${TableName.Project}."pitVersionLimit"`)
        .delete();
    } catch (error) {
      throw new DatabaseError({
        error,
        name: "Secret Version Prune"
      });
    }
  };

  return {
    ...secretVersionV2Orm,
    pruneExcessVersions,
    findLatestVersionMany,
    bulkUpdate,
    findLatestVersionByFolderId
  };
};
