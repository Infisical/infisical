import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { PamSessionStatus } from "./pam-session-enums";

export type TPamSessionDALFactory = ReturnType<typeof pamSessionDALFactory>;
export const pamSessionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.PamSession);

  const findById = async (id: string, tx?: Knex) => {
    // Prefer the gateway pinned to this session (set at session-start, even when the resource is pool-backed
    // and the picked member differs from any direct gatewayId on the resource). Fall back to the resource's
    // gatewayId for sessions created before pinning was introduced.
    const session = await (tx || db.replicaNode())(TableName.PamSession)
      .leftJoin(TableName.PamAccount, `${TableName.PamSession}.accountId`, `${TableName.PamAccount}.id`)
      .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
      .leftJoin(TableName.GatewayV2, function joinSessionGateway() {
        this.on(
          `${TableName.GatewayV2}.id`,
          "=",
          db.raw("COALESCE(??, ??)", [`${TableName.PamSession}.gatewayId`, `${TableName.PamResource}.gatewayId`])
        );
      })
      .select(selectAllTableCols(TableName.PamSession))
      .select(db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      // Override session.gatewayId with the COALESCE'd value so consumers always see the
      // gateway actually in use (pinned for new sessions, resource's for legacy ones).
      .select(db.ref("id").withSchema(TableName.GatewayV2).as("gatewayId"))
      .where(`${TableName.PamSession}.id`, id)
      .first();

    return session;
  };

  const countActiveWebSessions = async (userId: string, projectId: string, tx?: Knex): Promise<number> => {
    const result = await (tx || db.replicaNode())(TableName.PamSession)
      .where("userId", userId)
      .where("projectId", projectId)
      .where("accessMethod", "web")
      .whereIn("status", [PamSessionStatus.Starting, PamSessionStatus.Active])
      .count("id as count")
      .first();

    return Number((result as { count?: string | number })?.count ?? 0);
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

  const findByProjectId = async (projectId: string, tx?: Knex) => {
    const sessions = await (tx || db.replicaNode())(TableName.PamSession)
      .leftJoin(TableName.PamAccount, `${TableName.PamSession}.accountId`, `${TableName.PamAccount}.id`)
      .leftJoin(TableName.PamResource, `${TableName.PamAccount}.resourceId`, `${TableName.PamResource}.id`)
      .leftJoin(TableName.GatewayV2, function joinSessionGateway() {
        this.on(
          `${TableName.GatewayV2}.id`,
          "=",
          db.raw("COALESCE(??, ??)", [`${TableName.PamSession}.gatewayId`, `${TableName.PamResource}.gatewayId`])
        );
      })
      .select(selectAllTableCols(TableName.PamSession))
      .select(db.ref("identityId").withSchema(TableName.GatewayV2).as("gatewayIdentityId"))
      .select(db.ref("id").withSchema(TableName.GatewayV2).as("gatewayId"))
      .where(`${TableName.PamSession}.projectId`, projectId);

    return sessions;
  };

  const endSessionById = async (sessionId: string, tx?: Knex) => {
    const [updated] = await (tx || db)(TableName.PamSession)
      .where("id", sessionId)
      .whereIn("status", [PamSessionStatus.Active, PamSessionStatus.Starting])
      .update({ status: PamSessionStatus.Ended, endedAt: new Date() })
      .returning("*");
    return updated;
  };

  const terminateSessionById = async (sessionId: string, tx?: Knex) => {
    const [updated] = await (tx || db)(TableName.PamSession)
      .where("id", sessionId)
      .whereIn("status", [PamSessionStatus.Active, PamSessionStatus.Starting])
      .update({ status: PamSessionStatus.Terminated, endedAt: new Date() })
      .returning("*");
    return updated;
  };

  return {
    ...orm,
    findById,
    findByProjectId,
    expireSessionById,
    countActiveWebSessions,
    endSessionById,
    terminateSessionById
  };
};
