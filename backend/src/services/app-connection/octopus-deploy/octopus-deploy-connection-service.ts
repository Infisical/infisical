import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";
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
  actor: OrgServiceActor
) => Promise<TOctopusDeployConnection>;

export const octopusDeployConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listSpaces = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.OctopusDeploy, connectionId, actor);
    try {
      const spaces = await getOctopusDeploySpaces(appConnection);

      return spaces;
    } catch (error) {
      logger.error({ error, connectionId, actor: actor.type }, "Failed to list Octopus Deploy spaces");
      return [];
    }
  };

  const listProjects = async (connectionId: string, spaceId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.OctopusDeploy, connectionId, actor);

    try {
      const projects = await getOctopusDeployProjects(appConnection, spaceId);

      return projects;
    } catch (error) {
      logger.error({ error, connectionId, spaceId, actor: actor.type }, "Failed to list Octopus Deploy projects");
      return [];
    }
  };

  const getScopeValues = async (connectionId: string, spaceId: string, projectId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.OctopusDeploy, connectionId, actor);

    try {
      const scopeValues = await getOctopusDeployScopeValues(appConnection, spaceId, projectId);

      return scopeValues;
    } catch (error) {
      logger.error(
        { error, connectionId, spaceId, projectId, actor: actor.type },
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
