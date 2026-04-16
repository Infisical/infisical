import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify, selectAllTableCols } from "@app/lib/knex";

import { GATEWAY_HEARTBEAT_TIMEOUT_MS } from "../gateway-v2/gateway-v2-constants";
import { GatewayHealthCheckStatus } from "../gateway-v2/gateway-v2-types";

export type TGatewayPoolDALFactory = ReturnType<typeof gatewayPoolDalFactory>;

export const gatewayPoolDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GatewayPool);

  const findByOrgIdWithDetails = async (orgId: string) => {
    try {
      const oneHourAgo = new Date(Date.now() - GATEWAY_HEARTBEAT_TIMEOUT_MS);

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
            `COUNT(DISTINCT CASE WHEN ${TableName.GatewayV2}."heartbeat" > ? AND (${TableName.GatewayV2}."lastHealthCheckStatus" IS NULL OR ${TableName.GatewayV2}."lastHealthCheckStatus" != ?) THEN ${TableName.GatewayPoolMembership}."gatewayId" END) AS "healthyMemberCount"`,
            [oneHourAgo, GatewayHealthCheckStatus.Failed]
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

  const findByIdWithMembers = async (poolId: string) => {
    try {
      const pool = await db.replicaNode()(TableName.GatewayPool).where(`${TableName.GatewayPool}.id`, poolId).first();

      if (!pool) return null;

      const members = await db
        .replicaNode()(TableName.GatewayPoolMembership)
        .where(`${TableName.GatewayPoolMembership}.gatewayPoolId`, poolId)
        .join(TableName.GatewayV2, `${TableName.GatewayPoolMembership}.gatewayId`, `${TableName.GatewayV2}.id`)
        .select(
          `${TableName.GatewayV2}.id`,
          `${TableName.GatewayV2}.name`,
          `${TableName.GatewayV2}.heartbeat`,
          `${TableName.GatewayV2}.lastHealthCheckStatus`
        );

      return { ...pool, gateways: members };
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayPool}: FindByIdWithMembers` });
    }
  };

  return { ...orm, findByOrgIdWithDetails, findByIdWithMembers };
};
