import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { SecretType, TableName, TSecretVersions } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretReplicationDALFactory = ReturnType<typeof secretReplicationDALFactory>;

export const secretReplicationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SecretVersion);

  /**
   *  Retrieves secret versions based on the specified filter criteria.
   *
   * @param {Object} filter - The filter criteria for querying secret versions.
   * @param {string} filter.folderId - The ID of the folder containing the secrets.
   * @param {Array<Object>} filter.secrets - An array of secret objects containing the ID and version of each secret.
   * @param {Knex} [tx] - An optional Knex transaction object. If provided, the query will be executed within this transaction.
   *
   * @returns {Promise<Array<Object>>} A promise that resolves to an array of secret version documents that match the filter criteria.
   */
  const findSecretVersions = async (
    filter: { folderId: string; secrets: { id: string; version: number }[] },
    tx?: Knex
  ) => {
    if (!filter.secrets) return [];

    const sqlRawDocs = await (tx || db)(TableName.SecretVersion)
      .where({ folderId: filter.folderId })
      .andWhere((bd) => {
        filter.secrets.forEach((el) => {
          void bd.orWhere({
            [`${TableName.SecretVersion}.secretId` as "secretId"]: el.id,
            [`${TableName.SecretVersion}.version` as "version"]: el.version,
            [`${TableName.SecretVersion}.type` as "type"]: SecretType.Shared
          });
        });
      })
      .leftJoin<TSecretVersions>(
        (tx || db)(TableName.SecretVersion)
          .where("isReplicated", true)
          .groupBy("secretId")
          .max("version")
          .select("secretId")
          .as("latestVersion"),
        `${TableName.SecretVersion}.secretId`,
        "latestVersion.secretId"
      )
      .select(db.ref("max").withSchema("latestVersion").as("latestReplicatedVersion"))
      .select(selectAllTableCols(TableName.SecretVersion));

    return sqlRawDocs;
  };

  return {
    findSecretVersions,
    ...orm
  };
};
