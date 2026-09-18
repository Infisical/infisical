import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { listKempVirtualServices } from "./kemp-loadmaster-connection-fns";
import { TKempLoadMasterConnection } from "./kemp-loadmaster-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TKempLoadMasterConnection>;

export const kempLoadMasterConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const listVirtualServices = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.KempLoadMaster, connectionId, actor);

    const gatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: appConnection.gatewayId,
      gatewayPoolId: appConnection.gatewayPoolId
    });

    const virtualServices = await listKempVirtualServices(
      { gatewayId, credentials: appConnection.credentials },
      gatewayV2Service
    );

    return virtualServices;
  };

  return {
    listVirtualServices
  };
};
