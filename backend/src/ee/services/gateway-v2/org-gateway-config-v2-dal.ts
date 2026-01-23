import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas/models";
import { ormify } from "@app/lib/knex";

export type TOrgGatewayConfigV2DALFactory = ReturnType<typeof orgGatewayConfigV2DalFactory>;

export const orgGatewayConfigV2DalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.OrgGatewayConfigV2);

  return orm;
};
