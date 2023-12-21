import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TSecretBlindIndexDalFactory = ReturnType<typeof secretBlindIndexDalFactory>;

export const secretBlindIndexDalFactory = (db: TDbClient) => {
  const secretBlindIndexOrm = ormify(db, TableName.SecretBlindIndex);
  return secretBlindIndexOrm;
};
