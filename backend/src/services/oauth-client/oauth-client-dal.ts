import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOauthClientDALFactory = ReturnType<typeof oauthClientDALFactory>;

export const oauthClientDALFactory = (db: TDbClient) => {
  const oauthClientOrm = ormify(db, TableName.OauthClient);

  return oauthClientOrm;
};
