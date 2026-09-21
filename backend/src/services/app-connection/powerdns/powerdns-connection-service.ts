import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import { listPowerDnsZones } from "./powerdns-connection-fns";
import { TPowerDnsConnection, TPowerDnsConnectionConfig } from "./powerdns-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TPowerDnsConnection>;

export const powerDnsConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service?: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService?: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const listZones = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.PowerDns, connectionId, actor);

    return listPowerDnsZones({ ...appConnection, orgId: actor.orgId } as TPowerDnsConnectionConfig, {
      gatewayV2Service,
      gatewayPoolService
    });
  };

  return { listZones };
};
