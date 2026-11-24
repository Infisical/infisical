import { TDbClient } from "@app/db";
import { TableName } from "@app/db/schemas";
import { DatabaseError } from "@app/lib/errors";

export type TGatewayAlertDALFactory = ReturnType<typeof gatewayAlertDALFactory>;

export type TGatewayRef = {
  id: string;
  name: string;
};

export const gatewayAlertDALFactory = (db: TDbClient) => {
  // Primary on purpose: the event is emitted in the transaction that marks the gateway alerted, and an empty
  // read here is terminal, so a lagging replica would swallow the notification.
  const findGatewaysByIds = async (gatewayIds: string[], orgId: string): Promise<TGatewayRef[]> => {
    if (gatewayIds.length === 0) return [];
    try {
      return (await db
        .primaryNode()(TableName.GatewayV2)
        .whereIn("id", gatewayIds)
        .where({ orgId })
        .select("id", "name")) as TGatewayRef[];
    } catch (error) {
      throw new DatabaseError({ error, name: "GatewayAlert: findGatewaysByIds" });
    }
  };

  return { findGatewaysByIds };
};
