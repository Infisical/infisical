import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TCoolifyConnection } from "./coolify-connection-types";
import { listCoolifyApplications, listCoolifyProjects, listCoolifyProjectEnvironments } from "./coolify-connection-fns";
import { logger } from "@app/lib/logger";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCoolifyConnection>;

export const coolifyConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, action: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, action);

    try {
      const projects = await listCoolifyProjects(appConnection);
      return projects;
    } catch (error) {
      logger.error(error, "Failed to establish connection with coolify");
      return [];
    }
  };

  const listProjectEnvironments = async (connectionId: string, projectId: string, action: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, action);

    try {
      const envs = await listCoolifyProjectEnvironments(appConnection, projectId);
      return envs;
    } catch (error) {
      logger.error(error, "Failed to establish connection with coolify");
      return [];
    }
  };

  const listApplications = async (connectionId: string, environmentId: number, action: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, action);

    try {
      const applications = await listCoolifyApplications(appConnection);
      return applications.filter((app) => app.environment_id === environmentId);
    } catch (error) {
      logger.error(error, "Failed to establish connection with coolify");
      return [];
    }
  };

  return {
    listProjects,
    listProjectEnvironments,
    listApplications
  };
};
