import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityUaDALFactory = ReturnType<typeof identityUaDALFactory>;

export const identityUaDALFactory = (db: TDbClient) => {
  const universalAuthOrm = ormify(db, TableName.IdentityUniversalAuth);

  return universalAuthOrm;
};
