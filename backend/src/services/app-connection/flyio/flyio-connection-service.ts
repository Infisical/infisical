import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listFlyioApps } from "./flyio-connection-fns";
import { TFlyioConnection } from "./flyio-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TFlyioConnection>;

export const flyioConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApps = async (connectionId: string, actor: OrgServiceActor) => {
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
