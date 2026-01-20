import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, TOrmify } from "@app/lib/knex";

export type TSecretReplicationDALFactory = TOrmify<TableName.SecretVersion>;

export const secretReplicationDALFactory = (db: TDbClient): TSecretReplicationDALFactory => {
  const orm = ormify(db, TableName.SecretVersion);
  return orm;
};
