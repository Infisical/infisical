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

  return {
    ...orm,
    findBySecretId,
    findBySecretIds
  };
};
