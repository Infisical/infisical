import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { ormify, selectAllTableCols } from "@app/lib/knex";

export type TAgentGatewayServiceLinkDALFactory = ReturnType<typeof agentGatewayServiceLinkDALFactory>;

export type TLinkedProxiedService = {
  linkId: string;
  agentGatewayId: string;
  priority: number;
  id: string;
  name: string;
  hostPattern: string;
  isEnabled: boolean;
  projectId: string;
  lastUsedAt?: Date | null;
  // Carried on the join so a bundle resolve does not need a query per service to find out whose authority
  // to resolve its credentials under. The resolve runs on every broker poll, so an N+1 here is a per-minute
  // cost per session.
  configuredByActorType: string;
  configuredByUserId?: string | null;
  configuredByIdentityId?: string | null;
  configuredByLabel: string;
};

export const agentGatewayServiceLinkDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentGatewayService);

  // Ordered by priority then name, because priority is what breaks a host-pattern tie between two
  // services on the same agent gateway. The broker relies on this order, so it is not cosmetic.
  const findServicesByAgentGatewayIds = async (
    agentGatewayIds: string[],
    tx?: Knex
  ): Promise<TLinkedProxiedService[]> => {
    if (!agentGatewayIds.length) return [];

    return (tx || db.replicaNode())(TableName.AgentGatewayService)
      .whereIn(`${TableName.AgentGatewayService}.agentGatewayId`, agentGatewayIds)
      .join(TableName.ProxiedService, `${TableName.ProxiedService}.id`, `${TableName.AgentGatewayService}.serviceId`)
      .select(
        db.ref("id").withSchema(TableName.AgentGatewayService).as("linkId"),
        db.ref("agentGatewayId").withSchema(TableName.AgentGatewayService),
        db.ref("priority").withSchema(TableName.AgentGatewayService),
        db.ref("id").withSchema(TableName.ProxiedService),
        db.ref("name").withSchema(TableName.ProxiedService),
        db.ref("hostPattern").withSchema(TableName.ProxiedService),
        db.ref("isEnabled").withSchema(TableName.ProxiedService),
        db.ref("projectId").withSchema(TableName.ProxiedService),
        db.ref("lastUsedAt").withSchema(TableName.ProxiedService),
        db.ref("configuredByActorType").withSchema(TableName.ProxiedService),
        db.ref("configuredByUserId").withSchema(TableName.ProxiedService),
        db.ref("configuredByIdentityId").withSchema(TableName.ProxiedService),
        db.ref("configuredByLabel").withSchema(TableName.ProxiedService)
      )
      .orderBy([
        { column: `${TableName.AgentGatewayService}.priority`, order: "asc" },
        { column: `${TableName.ProxiedService}.name`, order: "asc" }
      ]);
  };

  const countByAgentGatewayIds = async (agentGatewayIds: string[], tx?: Knex) => {
    if (!agentGatewayIds.length) return {} as Record<string, number>;

    const rows = await (tx || db.replicaNode())(TableName.AgentGatewayService)
      .whereIn("agentGatewayId", agentGatewayIds)
      .groupBy("agentGatewayId")
      .select("agentGatewayId")
      .count<{ agentGatewayId: string; count: string | number }[]>("id");

    return rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.agentGatewayId] = Number(row.count);
      return acc;
    }, {});
  };

  // Used to explain a proxied-service delete: a service linked to an agent gateway is in use, and
  // cascading the link away silently would stop brokering for a live agent with no trace.
  const findAgentGatewaysByServiceId = async (serviceId: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.AgentGatewayService)
      .where(`${TableName.AgentGatewayService}.serviceId`, serviceId)
      .join(TableName.AgentGateway, `${TableName.AgentGateway}.id`, `${TableName.AgentGatewayService}.agentGatewayId`)
      .select(db.ref("id").withSchema(TableName.AgentGateway), db.ref("name").withSchema(TableName.AgentGateway));

  const findByAgentGatewayId = async (agentGatewayId: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.AgentGatewayService)
      .where({ agentGatewayId })
      .select(selectAllTableCols(TableName.AgentGatewayService));

  return {
    ...orm,
    findServicesByAgentGatewayIds,
    countByAgentGatewayIds,
    findAgentGatewaysByServiceId,
    findByAgentGatewayId
  };
};
