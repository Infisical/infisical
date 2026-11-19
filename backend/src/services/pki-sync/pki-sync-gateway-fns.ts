import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";

type TGatewayBinding = {
  connection: { gatewayId?: string | null; gatewayPoolId?: string | null };
};

// The gateway named on the connection, or whichever one its pool hands out.
export const resolveEffectiveSyncGatewayId = async (
  pkiSync: TGatewayBinding,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
): Promise<string | null> => {
  if (!gatewayPoolService) return pkiSync.connection.gatewayId ?? null;

  return gatewayPoolService.resolveEffectiveGatewayId({
    gatewayId: pkiSync.connection.gatewayId,
    gatewayPoolId: pkiSync.connection.gatewayPoolId
  });
};
