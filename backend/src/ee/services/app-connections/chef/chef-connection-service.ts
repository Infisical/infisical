import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../../../../services/app-connection/app-connection-enums";
import { TGatewayPoolServiceFactory } from "../../gateway-pool/gateway-pool-service";
import { TGatewayV2ServiceFactory } from "../../gateway-v2/gateway-v2-service";
import { TLicenseServiceFactory } from "../../license/license-service";
import { listChefDataBagItems, listChefDataBags } from "./chef-connection-fns";
import { TChefConnection } from "./chef-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TChefConnection>;

// Enterprise check
export const checkPlan = async (licenseService: Pick<TLicenseServiceFactory, "getPlan">, orgId: string) => {
  const plan = await licenseService.getPlan(orgId);
  if (!plan.enterpriseAppConnections)
    throw new BadRequestError({
      message:
        "Failed to use app connection due to plan restriction. Upgrade plan to access enterprise app connections."
    });
};

export const chefConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  licenseService: Pick<TLicenseServiceFactory, "getPlan">,
  gatewayV2Service: Pick<TGatewayV2ServiceFactory, "getPlatformConnectionDetailsByGatewayId">,
  gatewayPoolService: Pick<TGatewayPoolServiceFactory, "resolveEffectiveGatewayId">
) => {
  const $getResolvedConnection = async (appConnectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Chef, appConnectionId, actor);

    if (!appConnection) {
      throw new ForbiddenRequestError({ message: "App connection not found" });
    }

    const effectiveGatewayId = await gatewayPoolService.resolveEffectiveGatewayId({
      gatewayId: appConnection.gatewayId,
      gatewayPoolId: appConnection.gatewayPoolId
    });

    return { ...appConnection, gatewayId: effectiveGatewayId, gatewayPoolId: null };
  };

  const listDataBags = async (appConnectionId: string, actor: OrgServiceActor) => {
    await checkPlan(licenseService, actor.orgId);

    const appConnection = await $getResolvedConnection(appConnectionId, actor);

    return listChefDataBags(appConnection, gatewayV2Service);
  };

  const listDataBagItems = async (appConnectionId: string, dataBagName: string, actor: OrgServiceActor) => {
    await checkPlan(licenseService, actor.orgId);

    const appConnection = await $getResolvedConnection(appConnectionId, actor);

    return listChefDataBagItems(appConnection, dataBagName, gatewayV2Service);
  };

  return {
    listDataBags,
    listDataBagItems
  };
};
