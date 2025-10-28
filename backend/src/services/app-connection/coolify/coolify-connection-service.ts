import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listCoolifyApplications, listCoolifyProjectEnvironments, listCoolifyProjects } from "./coolify-connection-fns";
import { TCoolifyConnection } from "./coolify-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCoolifyConnection>;

export const coolifyConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, actor);

    try {
      const projects = await listCoolifyProjects(appConnection);
      return projects;
    } catch (error) {
      logger.error(error, "Failed to establish connection with coolify");
      return [];
    }
  };

  const listProjectEnvironments = async (connectionId: string, projectId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, actor);

    try {
      const envs = await listCoolifyProjectEnvironments(appConnection, projectId);
      return envs;
    } catch (error) {
      logger.error(error, "Failed to establish connection with coolify");
      return [];
    }
  };

  const listApplications = async (connectionId: string, environmentId: number, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, actor);

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
