import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityProfileDALFactory = ReturnType<typeof identityProfileDALFactory>;

export const identityProfileDALFactory = (db: TDbClient) => {
  const identityProfileOrm = ormify(db, TableName.IdentityProfile);

  return identityProfileOrm;
};
