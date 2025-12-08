import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { PamSessionStatus } from "./pam-session-enums";

export type TPamSessionDALFactory = ReturnType<typeof pamSessionDALFactory>;
export const pamSessionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamSession);

  const findById = async (id: string, tx?: Knex) => {
    const session = await (tx || db.replicaNode())(TableName.PamSession)
      .leftJoin(TableName.PamAccount, `${TableName.PamSession}.accountId`, `${TableName.PamAccount}.id`)
      .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
      .leftJoin(TableName.GatewayV2, `${TableName.PamResource}.gatewayId`, `${TableName.GatewayV2}.id`)
      .select(selectAllTableCols(TableName.PamSession))
      .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      .where(`${TableName.PamSession}.id`, id)
      .first();

    return session;
  };

  const expireSessionById = async (sessionId: string, tx?: Knex) => {
    const now = new Date();

    const updatedCount = await (tx || db)(TableName.PamSession)
      .where("id", sessionId)
      .whereIn("status", [PamSessionStatus.Active, PamSessionStatus.Starting])
      .update({
        status: PamSessionStatus.Ended,
        endedAt: now
      });

    return updatedCount;
  };

  return { ...orm, findById, expireSessionById };
};
