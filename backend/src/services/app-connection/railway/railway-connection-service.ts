import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listProjects as getRailwayProjects } from "./railway-connection-fns";
import { TRailwayConnection } from "./railway-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TRailwayConnection>;

export const railwayConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Railway, connectionId, actor);
    try {
      const projects = await getRailwayProjects(appConnection);

      return projects;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Railway");
      return [];
    }
  };

  return {
    listProjects
  };
};
