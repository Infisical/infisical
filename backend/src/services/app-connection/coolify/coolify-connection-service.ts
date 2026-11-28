import { TActorContext } from "@app/domains/lib/actor-context";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";

import { AppConnection } from "../app-connection-enums";
import { listCoolifyResources } from "./coolify-connection-fns";
import { TCoolifyConnection } from "./coolify-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TCoolifyConnection>;

export const coolifyConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const listResources = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, actor);

    return listCoolifyResources(appConnection, gatewayV2Service, gatewayPoolService);
  };

  return {
    listResources
  };
};
