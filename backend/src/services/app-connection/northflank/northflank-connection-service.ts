import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listProjects as getNorthflankProjects } from "./northflank-connection-fns";
import { TNorthflankConnection } from "./northflank-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TNorthflankConnection>;

export const northflankConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Northflank, connectionId, actor);
    try {
      const projects = await getNorthflankProjects(appConnection);

      return projects;
    } catch (error) {
      logger.error({ error, connectionId, actor: actor.type }, "Failed to establish connection with Northflank");
      return [];
    }
  };

  return {
    listProjects
  };
};
