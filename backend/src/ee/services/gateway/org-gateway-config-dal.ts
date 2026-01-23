import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TOrgGatewayConfigDALFactory = ReturnType<typeof orgGatewayConfigDALFactory>;

export const orgGatewayConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.OrgGatewayConfig);
  return orm;
};
