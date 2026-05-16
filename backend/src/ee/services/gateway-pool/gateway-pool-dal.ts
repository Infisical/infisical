import { Knex } from "knex";

import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { HEARTBEAT_BUFFER_SECONDS } from "../gateway-v2/gateway-v2-constants";

export type TGatewayPoolDALFactory = ReturnType<typeof gatewayPoolDalFactory>;

export const gatewayPoolDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GatewayPool);

  const findByOrgIdWithDetails = async (orgId: string) => {
    try {
      const pools = await db
        .replicaNode()(TableName.GatewayPool)
        .where(`${TableName.GatewayPool}.orgId`, orgId)
        .leftJoin(
          TableName.GatewayPoolMembership,
          `${TableName.GatewayPool}.id`,
          `${TableName.GatewayPoolMembership}.gatewayPoolId`
        )
        .leftJoin(TableName.GatewayV2, `${TableName.GatewayPoolMembership}.gatewayId`, `${TableName.GatewayV2}.id`)
        .select(selectAllTableCols(TableName.GatewayPool))
        .select(
          db.raw(`COUNT(DISTINCT ${TableName.GatewayPoolMembership}."gatewayId") AS "memberCount"`),
          db.raw(
            `COUNT(DISTINCT CASE WHEN COALESCE(${TableName.GatewayV2}."heartbeatTTL", 0) > 0 AND ${TableName.GatewayV2}."heartbeat" + make_interval(secs => COALESCE(${TableName.GatewayV2}."heartbeatTTL", 0) + ${HEARTBEAT_BUFFER_SECONDS}) > NOW() THEN ${TableName.GatewayPoolMembership}."gatewayId" END) AS "healthyMemberCount"`
          ),
          db.raw(
            `COALESCE(array_agg(DISTINCT ${TableName.GatewayPoolMembership}."gatewayId") FILTER (WHERE ${TableName.GatewayPoolMembership}."gatewayId" IS NOT NULL), '{}') AS "memberGatewayIds"`
          )
        )
        .groupBy(`${TableName.GatewayPool}.id`)
        .orderBy(`${TableName.GatewayPool}.name`, "asc");

      return pools.map((p) => {
        const raw = p as Record<string, unknown>;
        return {
          ...p,
          memberCount: Number(raw.memberCount ?? 0),
          healthyMemberCount: Number(raw.healthyMemberCount ?? 0),
          memberGatewayIds: (raw.memberGatewayIds as string[]) ?? []
        };
      });
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayPool}: FindByOrgId` });
    }
  };

  const findByIdWithMembers = async (poolId: string, orgId: string) => {
    try {
      const pool = await db
        .replicaNode()(TableName.GatewayPool)
        .where(`${TableName.GatewayPool}.id`, poolId)
        .where(`${TableName.GatewayPool}.orgId`, orgId)
        .first();

      if (!pool) return null;

      const members = await db
        .replicaNode()(TableName.GatewayPoolMembership)
        .where(`${TableName.GatewayPoolMembership}.gatewayPoolId`, poolId)
        .join(TableName.GatewayV2, `${TableName.GatewayPoolMembership}.gatewayId`, `${TableName.GatewayV2}.id`)
        .select(
          `${TableName.GatewayV2}.id`,
          `${TableName.GatewayV2}.name`,
          `${TableName.GatewayV2}.heartbeat`,
          `${TableName.GatewayV2}.heartbeatTTL`
        );

      return { ...pool, gateways: members };
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayPool}: FindByIdWithMembers` });
    }
  };

  const countByOrgId = async (orgId: string, tx?: Knex) => {
    try {
      const result = await (tx || db.replicaNode())(TableName.GatewayPool).where({ orgId }).count("id").first();
      return parseInt(String(result?.count || "0"), 10);
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayPool}: CountByOrgId` });
    }
  };

  return { ...orm, findByOrgIdWithDetails, findByIdWithMembers, countByOrgId };
};
