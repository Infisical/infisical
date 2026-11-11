import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";
import { AppConnection } from "@app/services/app-connection/app-connection-enums";

import {
  getOctopusDeployProjects,
  getOctopusDeployScopeValues,
  getOctopusDeploySpaces
} from "./octopus-deploy-connection-fns";
import { TOctopusDeployConnection } from "./octopus-deploy-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TOctopusDeployConnection>;

export const octopusDeployConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listSpaces = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.OctopusDeploy, connectionId, actor);
    try {
      const spaces = await getOctopusDeploySpaces(appConnection);

      return spaces;
    } catch (error) {
      logger.error({ error, connectionId, actor: actor.principal.type }, "Failed to list Octopus Deploy spaces");
      return [];
    }
  };

  const listProjects = async (connectionId: string, spaceId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.OctopusDeploy, connectionId, actor);

    try {
      const projects = await getOctopusDeployProjects(appConnection, spaceId);

      return projects;
    } catch (error) {
      logger.error(
        { error, connectionId, spaceId, actor: actor.principal.type },
        "Failed to list Octopus Deploy projects"
      );
      return [];
    }
  };

  const getScopeValues = async (connectionId: string, spaceId: string, projectId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.OctopusDeploy, connectionId, actor);

    try {
      const scopeValues = await getOctopusDeployScopeValues(appConnection, spaceId, projectId);

      return scopeValues;
    } catch (error) {
      logger.error(
        { error, connectionId, spaceId, projectId, actor: actor.principal.type },
        "Failed to get Octopus Deploy scope values"
      );
      return null;
    }
  };

  return {
    listSpaces,
    listProjects,
    getScopeValues
  };
};
