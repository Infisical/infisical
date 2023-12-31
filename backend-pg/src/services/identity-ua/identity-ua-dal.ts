import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityUaDalFactory = ReturnType<typeof identityUaDalFactory>;

export const identityUaDalFactory = (db: TDbClient) => {
  const universalAuthOrm = ormify(db, TableName.IdentityUniversalAuth);

  return universalAuthOrm;
};
