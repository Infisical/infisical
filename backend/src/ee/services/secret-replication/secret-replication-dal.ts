import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSecretReplicationDALFactory = ReturnType<typeof secretReplicationDALFactory>;

export const secretReplicationDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.SecretVersion);
  return orm;
};
