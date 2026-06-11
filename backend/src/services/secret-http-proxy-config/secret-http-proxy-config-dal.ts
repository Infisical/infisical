import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretHttpProxyConfigDALFactory = ReturnType<typeof secretHttpProxyConfigDALFactory>;

export const secretHttpProxyConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SecretHttpProxyConfig);

  const findBySecretId = async (secretId: string, tx?: Knex) => {
    return orm.findOne({ secretId }, tx);
  };

  const findBySecretIds = async (secretIds: string[], tx?: Knex) => {
    const queryDb = tx || db.replicaNode();
    return queryDb(TableName.SecretHttpProxyConfig).whereIn("secretId", secretIds).select("*");
  };

  const findByEnvironmentAndPath = async (projectId: string, envSlug: string, secretPath: string, tx?: Knex) => {
    const queryDb = tx || db.replicaNode();
    return queryDb(TableName.SecretHttpProxyConfig)
      .join(TableName.SecretV2, `${TableName.SecretHttpProxyConfig}.secretId`, `${TableName.SecretV2}.id`)
      .join(TableName.SecretFolder, `${TableName.SecretV2}.folderId`, `${TableName.SecretFolder}.id`)
      .join(TableName.Environment, `${TableName.SecretFolder}.envId`, `${TableName.Environment}.id`)
      .where(`${TableName.Environment}.projectId`, projectId)
      .where(`${TableName.Environment}.slug`, envSlug)
      .where(`${TableName.SecretFolder}.name`, secretPath === "/" ? "root" : secretPath)
      .select(`${TableName.SecretHttpProxyConfig}.*`);
  };

  return {
    ...orm,
    findBySecretId,
    findBySecretIds,
    findByEnvironmentAndPath
  };
};
