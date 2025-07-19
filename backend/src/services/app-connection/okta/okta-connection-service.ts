import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listOktaApps } from "./okta-connection-fns";
import { TOktaConnection } from "./okta-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TOktaConnection>;

export const oktaConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApps = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Okta, connectionId, actor);
    const apps = await listOktaApps(appConnection);
    return apps;
  };

  return {
    listApps
  };
};
