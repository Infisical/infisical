import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TInternalKmsKeyVersionDALFactory = ReturnType<typeof internalKmsKeyVersionDALFactory>;

export const internalKmsKeyVersionDALFactory = (db: TDbClient) => {
  const internalKmsKeyVersionOrm = ormify(db, TableName.InternalKmsKeyVersion);
  return internalKmsKeyVersionOrm;
};
