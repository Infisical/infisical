import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TIdentityAzureAuthDALFactory = ReturnType<typeof identityAzureAuthDALFactory>;

export const identityAzureAuthDALFactory = (db: TDbClient) => {
  const azureAuthOrm = ormify(db, TableName.IdentityAzureAuth);
  return azureAuthOrm;
};
