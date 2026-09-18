import { OrgServiceActor } from "@app/lib/types";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { listSalesforceConnectionOauthApps } from "@app/services/app-connection/salesforce/salesforce-connection-fns";

import { TSalesforceConnection } from "./salesforce-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TSalesforceConnection>;

export const salesforceConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listOauthApps = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Salesforce, connectionId, actor);

    const apps = await listSalesforceConnectionOauthApps(appConnection);

    return apps;
  };

  return {
    listOauthApps
  };
};
