import { TActorContext } from "@app/domains/lib/actor-context";

import { AppConnection } from "../app-connection-enums";
import { listWindmillWorkspaces } from "./windmill-connection-fns";
import { TWindmillConnection } from "./windmill-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TWindmillConnection>;

export const windmillConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listWorkspaces = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Windmill, connectionId, actor);

    try {
      const workspaces = await listWindmillWorkspaces(appConnection);
      return workspaces;
    } catch (error) {
      return [];
    }
  };

  return {
    listWorkspaces
  };
};
