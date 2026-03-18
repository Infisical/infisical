import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import {
  getEnvironmentFolderTree as getRemoteEnvironmentFolderTree,
  listProjects as listRemoteProjects,
  TRemoteEnvironmentFolderTree,
  TRemoteProject
} from "./external-infisical-connection-fns";
import { TExternalInfisicalConnection } from "./external-infisical-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TExternalInfisicalConnection>;

export const externalInfisicalConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor): Promise<TRemoteProject[]> => {
    try {
      const appConnection = await getAppConnection(AppConnection.ExternalInfisical, connectionId, actor);
      return await listRemoteProjects(appConnection);
    } catch (error) {
      logger.error(error, "Failed to list projects from remote Infisical");
      return [];
    }
  };

  const getEnvironmentFolderTree = async (
    connectionId: string,
    projectId: string,
    actor: OrgServiceActor
  ): Promise<TRemoteEnvironmentFolderTree> => {
    try {
      const appConnection = await getAppConnection(AppConnection.ExternalInfisical, connectionId, actor);
      return await getRemoteEnvironmentFolderTree(appConnection, projectId);
    } catch (error) {
      logger.error(error, "Failed to get environment folder tree from remote Infisical");
      return {};
    }
  };

  return {
    listProjects,
    getEnvironmentFolderTree
  };
};
