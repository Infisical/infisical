import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TSecretVersionTagDALFactory = ReturnType<typeof secretVersionTagDALFactory>;

export const secretVersionTagDALFactory = (db: TDbClient) => {
  const secretVersionTagDAL = ormify(db, TableName.SecretVersionTag);
  return secretVersionTagDAL;
};
