import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityTokenAuthDALFactory = ReturnType<typeof identityTokenAuthDALFactory>;

export const identityTokenAuthDALFactory = (db: TDbClient) => {
  const tokenAuthOrm = ormify(db, TableName.IdentityTokenAuth);
  return tokenAuthOrm;
};
