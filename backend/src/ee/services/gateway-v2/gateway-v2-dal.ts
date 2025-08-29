import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify } from "@app/lib/knex";

export type TGatewayV2DALFactory = ReturnType<typeof gatewayV2DalFactory>;

export const gatewayV2DalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GatewayV2);

  return orm;
};
