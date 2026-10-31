import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { listImpervaSites } from "./imperva-connection-fns";
import { TImpervaConnection } from "./imperva-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TImpervaConnection>;

export const impervaConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const listSites = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Imperva, connectionId, actor);

    const gatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: appConnection.gatewayId,
      gatewayPoolId: appConnection.gatewayPoolId
    });

    return listImpervaSites({ gatewayId, credentials: appConnection.credentials }, gatewayV2Service);
  };

  return {
    listSites
  };
};
