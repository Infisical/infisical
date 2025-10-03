import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TPamResourceDALFactory = ReturnType<typeof pamResourceDALFactory>;
export const pamResourceDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamResource);

  const findById = async (id: string, tx?: Knex) => {
    const doc = await (tx || db.replicaNode())(TableName.PamResource)
      .join(TableName.GatewayV2, `${TableName.PamResource}.gatewayId`, `${TableName.GatewayV2}.id`)
      .select(selectAllTableCols(TableName.PamResource))
      .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      .where(`${TableName.PamResource}.id`, id)
      .first();

    return doc;
  };

  return { ...orm, findById };
};
