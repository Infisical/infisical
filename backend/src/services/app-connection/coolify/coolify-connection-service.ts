import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TCoolifyConnection, TCoolifyProjectEnvironment } from "./coolify-connection-types";
import { listCoolifyApplications, listCoolifyProjects, listCoolifyProjectEnvironments } from "./coolify-connection-fns";
import { logger } from "@app/lib/logger";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCoolifyConnection>;

export const coolifyConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApplications = async (connectionId: string, action: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Coolify, connectionId, action);

    try {
      const applications = await listCoolifyApplications(appConnection);
      const projects = await listCoolifyProjects(appConnection);
      const environments: TCoolifyProjectEnvironment[] = [];

      for await (const project of projects) {
        const projectEnvironments = await listCoolifyProjectEnvironments(appConnection, project.uuid);
        environments.push(
          ...projectEnvironments.map((env) => {
            env.projectName = project.name;
            return env;
          })
        );
      }

      for (const application of applications) {
        const appEnv = environments.find((env) => env.id === application.environment_id);
        if (appEnv) {
          application.projectName = appEnv.projectName;
          application.environmentName = appEnv.name;
          delete application.environment_id;
        } else {
          logger.warn("Coolify application with invalid environment id", application.name);
        }
      }

      return applications;
    } catch (error) {
      logger.error(error, "Failed to establish connection with coolify");
      return [];
    }
  };

  return {
    listApplications
  };
};
