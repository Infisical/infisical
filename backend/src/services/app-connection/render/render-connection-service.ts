import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listRenderEnvironmentGroups, listRenderServices } from "./render-connection-fns";
import { TRenderConnection } from "./render-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TRenderConnection>;

export const renderConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listServices = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Render, connectionId, actor);
    try {
      const services = await listRenderServices(appConnection);

      return services;
    } catch (error) {
      logger.error(error, "Failed to list services for Render connection");
      return [];
    }
  };

  const listEnvironmentGroups = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Render, connectionId, actor);
    try {
      const groups = await listRenderEnvironmentGroups(appConnection);

      return groups;
    } catch (error) {
      logger.error(error, "Failed to list environment groups for Render connection");
      return [];
    }
  };

  return {
    listServices,
    listEnvironmentGroups
  };
};
