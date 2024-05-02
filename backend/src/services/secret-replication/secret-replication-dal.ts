import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName, TSecretVersions } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TSecretReplicationDALFactory = ReturnType<typeof secretReplicationDALFactory>;

export const secretReplicationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SecretVersion);

  const findSecrets = async (filter: { folderId: string; secrets: { id: string; version: number }[] }, tx?: Knex) => {
    if (!filter.secrets) return [];

    const sqlRawDocs = await (tx || db)(TableName.SecretVersion)
      .where({ folderId: filter.folderId })
      .andWhere((bd) => {
        filter.secrets.forEach((el) => {
          void bd.orWhere({
            [`${TableName.SecretVersion}.secretId` as "secretId"]: el.id,
            [`${TableName.SecretVersion}.version` as "version"]: el.version
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
    findSecrets,
    ...orm
  };
};
