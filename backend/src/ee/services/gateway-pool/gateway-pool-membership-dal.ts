import { TDbClient } from "@app/db";
import { TableName, TGatewaysV2 } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";
import { ormify } from "@app/lib/knex";

import { HEARTBEAT_BUFFER_SECONDS } from "../gateway-v2/gateway-v2-constants";

export type TGatewayPoolMembershipDALFactory = ReturnType<typeof gatewayPoolMembershipDalFactory>;

export const gatewayPoolMembershipDalFactory = (db: TDbClient) => {
  const orm = ormify(db, TableName.GatewayPoolMembership);

  const findHealthyGatewaysByPoolId = async (poolId: string): Promise<TGatewaysV2[]> => {
    try {
      const gateways = await db
        .replicaNode()(TableName.GatewayPoolMembership)
        .where(`${TableName.GatewayPoolMembership}.gatewayPoolId`, poolId)
        .join(TableName.GatewayV2, `${TableName.GatewayPoolMembership}.gatewayId`, `${TableName.GatewayV2}.id`)
        .whereRaw(
          `COALESCE("${TableName.GatewayV2}"."heartbeatTTL", 0) > 0 AND "${TableName.GatewayV2}"."heartbeat" + make_interval(secs => COALESCE("${TableName.GatewayV2}"."heartbeatTTL", 0) + ${HEARTBEAT_BUFFER_SECONDS}) > NOW()`
        )
        .select(`${TableName.GatewayV2}.*`);

      return gateways as TGatewaysV2[];
    } catch (error) {
      throw new DatabaseError({ error, name: `${TableName.GatewayPoolMembership}: FindHealthyGateways` });
    }
  };

  return { ...orm, findHealthyGatewaysByPoolId };
};
