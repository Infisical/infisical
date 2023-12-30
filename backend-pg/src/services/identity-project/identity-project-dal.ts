import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityProjectDalFactory = ReturnType<typeof identityProjectDalFactory>;

export const identityProjectDalFactory = (db: TDbClient) => {
  const identityProjectOrm = ormify(db, TableName.IdentityProjectMembership);
  return identityProjectOrm;
};
