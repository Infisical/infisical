import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityDalFactory = ReturnType<typeof identityDalFactory>;

export const identityDalFactory = (db: TDbClient) => {
  const identityOrm = ormify(db, TableName.Identity);
  return identityOrm;
};
