import { TDbClient } from "@app/db";
import { TableName, TGatewaysV2 } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { GATEWAY_HEARTBEAT_TIMEOUT_MS } from "../gateway-v2/gateway-v2-constants";
import { GatewayHealthCheckStatus } from "../gateway-v2/gateway-v2-types";

export type TGatewayPoolMembershipDALFactory = ReturnType<typeof gatewayPoolMembershipDalFactory>;

export const gatewayPoolMembershipDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GatewayPoolMembership);

  const findHealthyGatewaysByPoolId = async (poolId: string): Promise<TGatewaysV2[]> => {
    try {
      const oneHourAgo = new Date(Date.now() - GATEWAY_HEARTBEAT_TIMEOUT_MS);

      const gateways = await db
        .replicaNode()(TableName.GatewayPoolMembership)
        .where(`${TableName.GatewayPoolMembership}.gatewayPoolId`, poolId)
        .join(TableName.GatewayV2, `${TableName.GatewayPoolMembership}.gatewayId`, `${TableName.GatewayV2}.id`)
        .where(`${TableName.GatewayV2}.heartbeat`, ">", oneHourAgo)
        .where((builder) => {
          void builder
            .whereNull(`${TableName.GatewayV2}.lastHealthCheckStatus`)
            .orWhereNot(`${TableName.GatewayV2}.lastHealthCheckStatus`, GatewayHealthCheckStatus.Failed);
        })
        .select(`${TableName.GatewayV2}.*`);

      return gateways as TGatewaysV2[];
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayPoolMembership}: FindHealthyGateways` });
    }
  };

  return { ...orm, findHealthyGatewaysByPoolId };
};
