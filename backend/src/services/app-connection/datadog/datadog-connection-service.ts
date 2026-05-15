import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listDatadogServiceAccounts } from "./datadog-connection-fns";
import { TDatadogConnection } from "./datadog-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TDatadogConnection>;

export const datadogConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listServiceAccounts = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Datadog, connectionId, actor);
    return listDatadogServiceAccounts(appConnection);
  };

  return {
    listServiceAccounts
  };
};
