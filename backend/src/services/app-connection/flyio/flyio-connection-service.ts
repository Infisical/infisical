import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { listFlyioApps } from "./flyio-connection-fns";
import { TFlyioConnection } from "./flyio-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TFlyioConnection>;

export const flyioConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApps = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Flyio, connectionId, actor);

    try {
      const apps = await listFlyioApps(appConnection);
      return apps;
    } catch (error) {
      logger.error(error, "Failed to establish connection with fly.io");
      return [];
    }
  };

  return {
    listApps
  };
};
