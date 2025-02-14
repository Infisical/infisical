import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TGatewayInstanceConfigDALFactory = ReturnType<typeof gatewayInstanceConfigDALFactory>;

export const gatewayInstanceConfigDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GatewayInstanceConfig);

  return orm;
};
