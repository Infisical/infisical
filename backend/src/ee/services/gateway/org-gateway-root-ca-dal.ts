import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TOrgGatewayRootCaDALFactory = ReturnType<typeof orgGatewayRootCaDALFactory>;

export const orgGatewayRootCaDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.OrgGatewayRootCa);
  return orm;
};
