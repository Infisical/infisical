import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIntegrationAuthDALFactory = ReturnType<typeof integrationAuthDALFactory>;

export const integrationAuthDALFactory = (db: TDbClient) => {
  const integrationAuthOrm = ormify(db, TableName.IntegrationAuth);
  return integrationAuthOrm;
};
