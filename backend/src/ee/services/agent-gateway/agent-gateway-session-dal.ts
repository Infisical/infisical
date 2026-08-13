import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { AgentGatewaySessionStatus } from "./agent-gateway-enums";

export type TAgentGatewaySessionDALFactory = ReturnType<typeof agentGatewaySessionDALFactory>;

export const agentGatewaySessionDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentGatewaySession);

  const findActiveById = async (id: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.AgentGatewaySession)
      .where({ id, status: AgentGatewaySessionStatus.Active })
      .select(selectAllTableCols(TableName.AgentGatewaySession))
      .first();

  // Drives the expiry cron. Oldest first so the backlog drains in the order it accumulated, and the
  // project join keeps a soft-deleted project's sessions out: the two soft-deletes are independent, so a
  // project being cleaned up must not have its leases revoked twice or its rows resurrected.
  const findExpiredActive = async (limit: number, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.AgentGatewaySession)
      .where(`${TableName.AgentGatewaySession}.status`, AgentGatewaySessionStatus.Active)
      .where(`${TableName.AgentGatewaySession}.expiresAt`, "<", new Date())
      .join(TableName.Project, `${TableName.Project}.id`, `${TableName.AgentGatewaySession}.projectId`)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .orderBy(`${TableName.AgentGatewaySession}.expiresAt`, "asc")
      .limit(limit)
      .select(selectAllTableCols(TableName.AgentGatewaySession));

  const countActiveByGatewayId = async (gatewayId: string, tx?: Knex) => {
    const [result] = await (tx || db.replicaNode())(TableName.AgentGatewaySession)
      .where({ gatewayId, status: AgentGatewaySessionStatus.Active })
      .where("expiresAt", ">", new Date())
      .count<{ count: string | number }[]>("id");
    return Number(result?.count ?? 0);
  };

  const countActiveByProjectId = async (projectId: string, tx?: Knex) => {
    const [result] = await (tx || db.replicaNode())(TableName.AgentGatewaySession)
      .where({ projectId, status: AgentGatewaySessionStatus.Active })
      .count<{ count: string | number }[]>("id");
    return Number(result?.count ?? 0);
  };

  const stampResolved = async ({ id, refFingerprint }: { id: string; refFingerprint: string }, tx?: Knex) => {
    await (tx || db)(TableName.AgentGatewaySession)
      .where({ id })
      .update({ lastResolvedAt: db.fn.now() as unknown as Date, resolvedRefFingerprint: refFingerprint });
  };

  // Newest first: a session list is a history, and the run someone just made is the one they want.
  const findByAgentGatewayId = async (
    { agentGatewayId, limit, offset }: { agentGatewayId: string; limit: number; offset: number },
    tx?: Knex
  ) => {
    try {
      return await (tx || db.replicaNode())(TableName.AgentGatewaySession)
        .where({ agentGatewayId })
        .orderBy("createdAt", "desc")
        .limit(limit)
        .offset(offset);
    } catch (error) {
      throw new DatabaseError({ error, name: "Find agent gateway sessions" });
    }
  };

  const countByAgentGatewayId = async (agentGatewayId: string, tx?: Knex) => {
    try {
      const [result] = await (tx || db.replicaNode())(TableName.AgentGatewaySession)
        .where({ agentGatewayId })
        .count<{ count: string | number }[]>("id");
      return Number(result?.count ?? 0);
    } catch (error) {
      throw new DatabaseError({ error, name: "Count agent gateway sessions" });
    }
  };

  return {
    ...orm,
    findActiveById,
    findByAgentGatewayId,
    countByAgentGatewayId,
    findExpiredActive,
    countActiveByGatewayId,
    countActiveByProjectId,
    stampResolved
  };
};
