import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TIntegrationAuthDalFactory = ReturnType<typeof integrationAuthDalFactory>;

export const integrationAuthDalFactory = (db: TDbClient) => {
  const integrationAuthOrm = ormify(db, TableName.IntegrationAuth);
  return integrationAuthOrm;
};
