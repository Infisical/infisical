import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretBlindIndexDALFactory = ReturnType<typeof secretBlindIndexDALFactory>;

export const secretBlindIndexDALFactory = (db: TDbClient) => {
  const secretBlindIndexOrm = ormify(db, TableName.SecretBlindIndex);
  return secretBlindIndexOrm;
};
