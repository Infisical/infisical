import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TInternalKmsDALFactory = ReturnType<typeof internalKmsDALFactory>;

export const internalKmsDALFactory = (db: TDbClient) => {
  const internalKmsOrm = ormify(db, TableName.InternalKms);
  return internalKmsOrm;
};
