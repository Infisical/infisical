import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { listNutanixClusters } from "./nutanix-prism-central-connection-fns";
import {
  TNutanixPrismCentralConnection,
  TNutanixPrismCentralConnectionConfig
} from "./nutanix-prism-central-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TNutanixPrismCentralConnection>;

export const nutanixPrismCentralConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const listClusters = async (
    { connectionId }: { connectionId: string },
    actor: OrgServiceActor
  ): Promise<{ id: string; name: string }[]> => {
    const appConnection = await getAppConnection(AppConnection.NutanixPrismCentral, connectionId, actor);
    const effectiveGatewayId = gatewayPoolService
      ? await gatewayPoolService.resolveEffectiveGatewayId({
          gatewayId: appConnection.gatewayId,
          gatewayPoolId: appConnection.gatewayPoolId
        })
      : (appConnection.gatewayId ?? null);

    return listNutanixClusters(
      {
        ...appConnection,
        gatewayId: effectiveGatewayId,
        gatewayPoolId: null,
        orgId: actor.orgId
      } as TNutanixPrismCentralConnectionConfig,
      gatewayV2Service
    );
  };

  return { listClusters };
};
