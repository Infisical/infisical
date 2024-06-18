import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TKmsDALFactory = ReturnType<typeof kmsDALFactory>;

export const kmsDALFactory = (db: TDbClient) => {
  const kmsOrm = ormify(db, TableName.KmsKey);
  return kmsOrm;
};
