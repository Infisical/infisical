import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityDALFactory = ReturnType<typeof identityDALFactory>;

export const identityDALFactory = (db: TDbClient) => {
  const identityOrm = ormify(db, TableName.Identity);
  return identityOrm;
};
