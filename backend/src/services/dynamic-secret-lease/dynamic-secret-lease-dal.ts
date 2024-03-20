import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TDynamicSecretLeaseDALFactory = ReturnType<typeof dynamicSecretLeaseDALFactory>;

export const dynamicSecretLeaseDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.DynamicSecretLease);
  return orm;
};
