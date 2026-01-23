import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityAliCloudAuthDALFactory = ReturnType<typeof identityAliCloudAuthDALFactory>;

export const identityAliCloudAuthDALFactory = (db: TDbClient) => {
  return ormify(db, TableName.IdentityAliCloudAuth);
};
