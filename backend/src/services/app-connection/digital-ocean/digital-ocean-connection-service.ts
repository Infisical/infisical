import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { DigitalOceanAppPlatformPublicAPI } from "./digital-ocean-connection-public-client";
import { TDigitalOceanConnection } from "./digital-ocean-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TDigitalOceanConnection>;

export const digitalOceanAppPlatformConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApps = async (connectionId: string, actor: OrgServiceActor) => {
    const connection = await getAppConnection(AppConnection.DigitalOcean, connectionId, actor);
    try {
      const apps = await DigitalOceanAppPlatformPublicAPI.getApps(connection);
      return apps;
    } catch (error) {
      logger.error(error, "Failed to list apps on Digital Ocean");
      return [];
    }
  };

  return {
    listApps
  };
};
