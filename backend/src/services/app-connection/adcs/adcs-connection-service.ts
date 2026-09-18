import { TGatewayPoolServiceFactory } from "@app/ee/services/gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "@app/ee/services/gateway-v2/gateway-v2-service";
import { AdcsTemplatesResult } from "@app/lib/gateway-v2/adcs-rpc";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { executeAdcsGatewayOperation, resolveAdcsCaName } from "./adcs-connection-fns";
import { TADCSConnection } from "./adcs-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TADCSConnection>;

export const adcsConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const targetFor = (appConnection: TADCSConnection) => ({
    gatewayId: appConnection.gatewayId,
    gatewayPoolId: appConnection.gatewayPoolId,
    credentials: appConnection.credentials
  });

  const listCertificateTemplates = async (connectionId: string, caName: string | undefined, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.ADCS, connectionId, actor);
    const result = await executeAdcsGatewayOperation<AdcsTemplatesResult>(
      {
        ...targetFor(appConnection),
        endpoint: "/v1/templates",
        caName: await resolveAdcsCaName(caName, async () => targetFor(appConnection), {
          gatewayV2Service,
          gatewayPoolService
        })
      },
      { gatewayV2Service, gatewayPoolService }
    );
    return result.templates;
  };

  return {
    listCertificateTemplates
  };
};
