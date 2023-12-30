import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIdentityAccessTokenDalFactory = ReturnType<typeof identityAccessTokenDalFactory>;

export const identityAccessTokenDalFactory = (db: TDbClient) => {
  const identityAccessTokenOrm = ormify(db, TableName.IdentityAccessToken);
  return identityAccessTokenOrm;
};
