import { SubscriptionProductCategory } from "@app/db/schemas";
import { BadRequestError, ForbiddenRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../../../../services/app-connection/app-connection-enums";
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
  if (!plan.get(SubscriptionProductCategory.Platform, "enterpriseAppConnections"))
    throw new BadRequestError({
      message:
        "Failed to use app connection due to plan restriction. Upgrade plan to access enterprise app connections."
    });
};

export const chefConnectionService = (
  getAppConnection: TGetAppConnectionFunc,
  licenseService: Pick<TLicenseServiceFactory, "getPlan">
) => {
  const listDataBags = async (appConnectionId: string, actor: OrgServiceActor) => {
    await checkPlan(licenseService, actor.orgId);

    const appConnection = await getAppConnection(AppConnection.Chef, appConnectionId, actor);

    if (!appConnection) {
      throw new ForbiddenRequestError({ message: "App connection not found" });
    }

    return listChefDataBags(appConnection);
  };

  const listDataBagItems = async (appConnectionId: string, dataBagName: string, actor: OrgServiceActor) => {
    await checkPlan(licenseService, actor.orgId);

    const appConnection = await getAppConnection(AppConnection.Chef, appConnectionId, actor);

    if (!appConnection) {
      throw new ForbiddenRequestError({ message: "App connection not found" });
    }

    return listChefDataBagItems(appConnection, dataBagName);
  };

  return {
    listDataBags,
    listDataBagItems
  };
};
