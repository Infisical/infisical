import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { listOnaProjects } from "./ona-connection-fns";
import { TOnaConnection } from "./ona-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TOnaConnection>;

export const onaConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Ona, connectionId, actor);
    try {
      return await listOnaProjects(appConnection);
    } catch (error) {
      logger.error(error, "Failed to establish connection with Ona");
      return [];
    }
  };

  return {
    listProjects
  };
};
