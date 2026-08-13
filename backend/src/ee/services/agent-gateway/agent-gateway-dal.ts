import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { sanitizeSqlLikeString } from "@app/lib/fn";
import { ormify, selectAllTableCols } from "@app/lib/knex";
import { OrderByDirection } from "@app/lib/types";

export type TAgentGatewayDALFactory = ReturnType<typeof agentGatewayDALFactory>;

// An agent gateway names either a single gateway or a pool, so a listing joins both and leaves the
// other side null. heartbeat and heartbeatTTL come along because health is derived from them, and the
// derivation has to happen server-side too, not just in the dashboard.
export type TAgentGatewayWithTransport = {
  id: string;
  name: string;
  description?: string | null;
  projectId: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  isLocalModeEnabled: boolean;
  unmatchedHostPolicy: string;
  allowedHosts: string[];
  lastUsedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  gatewayName?: string | null;
  gatewayHeartbeat?: Date | null;
  gatewayHeartbeatTTL?: number | null;
  gatewayCapabilities?: unknown;
  gatewayPoolName?: string | null;
};

const transportColumns = (db: TDbClient) => [
  selectAllTableCols(TableName.AgentGateway),
  db.ref("name").withSchema(TableName.GatewayV2).as("gatewayName"),
  db.ref("heartbeat").withSchema(TableName.GatewayV2).as("gatewayHeartbeat"),
  db.ref("heartbeatTTL").withSchema(TableName.GatewayV2).as("gatewayHeartbeatTTL"),
  db.ref("capabilities").withSchema(TableName.GatewayV2).as("gatewayCapabilities"),
  db.ref("name").withSchema(TableName.GatewayPool).as("gatewayPoolName")
];

export const agentGatewayDALFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.AgentGateway);

  const $withTransport = (tx?: Knex) =>
    (tx || db.replicaNode())(TableName.AgentGateway)
      .leftJoin(TableName.GatewayV2, `${TableName.GatewayV2}.id`, `${TableName.AgentGateway}.gatewayId`)
      .leftJoin(TableName.GatewayPool, `${TableName.GatewayPool}.id`, `${TableName.AgentGateway}.gatewayPoolId`);

  const findByProjectId = async (
    {
      projectId,
      search,
      orderDirection = OrderByDirection.ASC,
      limit,
      offset = 0
    }: {
      projectId: string;
      search?: string;
      orderDirection?: OrderByDirection;
      limit?: number;
      offset?: number;
    },
    tx?: Knex
  ): Promise<TAgentGatewayWithTransport[]> => {
    const query = $withTransport(tx)
      .where(`${TableName.AgentGateway}.projectId`, projectId)
      .where((bd) => {
        if (search) {
          void bd.whereILike(`${TableName.AgentGateway}.name`, `%${sanitizeSqlLikeString(search)}%`);
        }
      })
      .select(transportColumns(db))
      .orderBy(`${TableName.AgentGateway}.name`, orderDirection);

    if (limit) {
      void query.limit(limit).offset(offset);
    }

    return query;
  };

  const countByProjectId = async ({ projectId, search }: { projectId: string; search?: string }, tx?: Knex) => {
    const query = (tx || db.replicaNode())(TableName.AgentGateway).where(
      `${TableName.AgentGateway}.projectId`,
      projectId
    );

    if (search) {
      void query.whereILike(`${TableName.AgentGateway}.name`, `%${sanitizeSqlLikeString(search)}%`);
    }

    const [result] = await query.count<{ count: string | number }[]>(`${TableName.AgentGateway}.id`);
    return Number(result?.count ?? 0);
  };

  const findByIdWithTransport = async (id: string, tx?: Knex): Promise<TAgentGatewayWithTransport | undefined> =>
    $withTransport(tx).where(`${TableName.AgentGateway}.id`, id).select(transportColumns(db)).first();

  const findByProjectIdAndName = async (
    { projectId, name }: { projectId: string; name: string },
    tx?: Knex
  ): Promise<TAgentGatewayWithTransport | undefined> =>
    $withTransport(tx)
      .where(`${TableName.AgentGateway}.projectId`, projectId)
      .where(`${TableName.AgentGateway}.name`, name)
      .select(transportColumns(db))
      .first();

  // Feeds the gateway and gateway-pool "connected resources" surfaces, so deleting a gateway an agent
  // gateway depends on is a loud, explainable failure rather than a silent downgrade to local-only.
  const findByGatewayId = async (gatewayId: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.AgentGateway)
      .where(`${TableName.AgentGateway}.gatewayId`, gatewayId)
      .join(TableName.Project, `${TableName.Project}.id`, `${TableName.AgentGateway}.projectId`)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .select(
        db.ref("id").withSchema(TableName.AgentGateway),
        db.ref("name").withSchema(TableName.AgentGateway),
        db.ref("projectId").withSchema(TableName.AgentGateway),
        db.ref("name").withSchema(TableName.Project).as("projectName")
      );

  const countByGatewayId = async (gatewayId: string, tx?: Knex) => {
    const [result] = await (tx || db.replicaNode())(TableName.AgentGateway)
      .where({ gatewayId })
      .count<{ count: string | number }[]>("id");
    return Number(result?.count ?? 0);
  };

  const findByGatewayPoolId = async (gatewayPoolId: string, tx?: Knex) =>
    (tx || db.replicaNode())(TableName.AgentGateway)
      .where(`${TableName.AgentGateway}.gatewayPoolId`, gatewayPoolId)
      .join(TableName.Project, `${TableName.Project}.id`, `${TableName.AgentGateway}.projectId`)
      .whereNull(`${TableName.Project}.deleteAfter`)
      .select(
        db.ref("id").withSchema(TableName.AgentGateway),
        db.ref("name").withSchema(TableName.AgentGateway),
        db.ref("projectId").withSchema(TableName.AgentGateway),
        db.ref("name").withSchema(TableName.Project).as("projectName")
      );

  const countByGatewayPoolId = async (gatewayPoolId: string, tx?: Knex) => {
    const [result] = await (tx || db.replicaNode())(TableName.AgentGateway)
      .where({ gatewayPoolId })
      .count<{ count: string | number }[]>("id");
    return Number(result?.count ?? 0);
  };

  const stampLastUsed = async (id: string, tx?: Knex) => {
    await (tx || db)(TableName.AgentGateway)
      .where({ id })
      .update({ lastUsedAt: db.fn.now() as unknown as Date });
  };

  return {
    ...orm,
    findByProjectId,
    countByProjectId,
    findByIdWithTransport,
    findByProjectIdAndName,
    findByGatewayId,
    countByGatewayId,
    findByGatewayPoolId,
    countByGatewayPoolId,
    stampLastUsed
  };
};
