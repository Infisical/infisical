import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { listRundeckProjects } from "./rundeck-connection-fns";
import { TRundeckConnection } from "./rundeck-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TRundeckConnection>;

export const rundeckConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Rundeck, connectionId, actor);
    try {
      const projects = await listRundeckProjects(appConnection);

      return projects;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Rundeck");
      return [];
    }
  };

  return {
    listProjects
  };
};
