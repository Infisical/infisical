import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { listTriggerDevEnvironments, listTriggerDevProjects } from "./trigger-dev-connection-fns";
import { TTriggerDevConnection } from "./trigger-dev-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TTriggerDevConnection>;

export const triggerDevConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.TriggerDev, connectionId, actor);

    try {
      const projects = await listTriggerDevProjects(appConnection);
      return projects;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Trigger.dev");
      return [];
    }
  };

  const listEnvironments = async (connectionId: string, projectRef: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.TriggerDev, connectionId, actor);

    try {
      const environments = await listTriggerDevEnvironments(appConnection, projectRef);
      return environments;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Trigger.dev");
      return [];
    }
  };

  return {
    listProjects,
    listEnvironments
  };
};
