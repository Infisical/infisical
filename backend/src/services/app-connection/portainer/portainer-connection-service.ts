import { TActorContext } from "@app/domains/lib/actor-context";
import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";

import { AppConnection } from "../app-connection-enums";
import { listPortainerEnvironments, listPortainerStacks } from "./portainer-connection-fns";
import { TPortainerConnection } from "./portainer-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TPortainerConnection>;

export const portainerConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const listEnvironments = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Portainer, connectionId, actor);

    return listPortainerEnvironments(appConnection, { gatewayV2Service, gatewayPoolService });
  };

  const listStacks = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Portainer, connectionId, actor);

    return listPortainerStacks(appConnection, { gatewayV2Service, gatewayPoolService });
  };

  return {
    listEnvironments,
    listStacks
  };
};
