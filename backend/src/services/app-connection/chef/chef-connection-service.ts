import { ForbiddenRequestError } from "@app/lib/errors";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listChefDataBagItems, listChefDataBags } from "./chef-connection-fns";
import { TChefConnection } from "./chef-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TChefConnection>;

export const chefConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listDataBags = async (appConnectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Chef, appConnectionId, actor);

    if (!appConnection) {
      throw new ForbiddenRequestError({ message: "App connection not found" });
    }

    return listChefDataBags(appConnection);
  };

  const listDataBagItems = async (appConnectionId: string, dataBagName: string, actor: OrgServiceActor) => {
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
