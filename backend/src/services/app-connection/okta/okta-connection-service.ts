import { TActorContext } from "@app/domains/lib/actor-context";

import { AppConnection } from "../app-connection-enums";
import { listOktaApps } from "./okta-connection-fns";
import { TOktaConnection } from "./okta-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TOktaConnection>;

export const oktaConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApps = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Okta, connectionId, actor);
    const apps = await listOktaApps(appConnection);
    return apps;
  };

  return {
    listApps
  };
};
