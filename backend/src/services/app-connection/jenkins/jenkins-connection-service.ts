import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listJenkinsFolders } from "./jenkins-connection-fns";
import { TJenkinsConnection } from "./jenkins-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TJenkinsConnection>;

export const jenkinsConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const listFolders = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Jenkins, connectionId, actor);

    return listJenkinsFolders(appConnection, { gatewayV2Service, gatewayPoolService });
  };

  return {
    listFolders
  };
};
