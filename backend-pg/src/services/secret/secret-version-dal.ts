import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretVersionDalFactory = ReturnType<typeof secretVersionDalFactory>;

export const secretVersionDalFactory = (db: TDbClient) => {
  const secretVersionOrm = ormify(db, TableName.SecretVersion);
  return secretVersionOrm;
};
