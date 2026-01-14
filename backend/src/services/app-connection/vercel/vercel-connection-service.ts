import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listProjects as getVercelProjects } from "./vercel-connection-fns";
import { TVercelConnection } from "./vercel-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TVercelConnection>;

export const vercelConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor, projectSearch?: string) => {
    const appConnection = await getAppConnection(AppConnection.Vercel, connectionId, actor);
    try {
      const projects = await getVercelProjects(appConnection, projectSearch);
      return projects;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Vercel");
      return [];
    }
  };

  return {
    listProjects
  };
};
