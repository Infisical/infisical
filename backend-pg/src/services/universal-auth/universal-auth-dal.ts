import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TUniversalAuthDalFactory = ReturnType<typeof universalAuthDalFactory>;

export const universalAuthDalFactory = (db: TDbClient) => {
  const universalAuthOrm = ormify(db, TableName.IdentityUniversalAuth);

  return universalAuthOrm;
};
