import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityOidcAuthDALFactory = ReturnType<typeof identityOidcAuthDALFactory>;

export const identityOidcAuthDALFactory = (db: TDbClient) => {
  const oidcAuthOrm = ormify(db, TableName.IdentityOidcAuth);
  return oidcAuthOrm;
};
