import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listOpenRouterWorkspaces } from "./open-router-connection-fns";
import { TOpenRouterConnection } from "./open-router-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TOpenRouterConnection>;

export const openRouterConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listWorkspaces = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.OpenRouter, connectionId, actor);
    return listOpenRouterWorkspaces(appConnection);
  };

  return {
    listWorkspaces
  };
};
