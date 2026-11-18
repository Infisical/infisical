import { TActorContext } from "@app/domains/lib/actor-context";

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
  actor: TActorContext
) => Promise<TExternalInfisicalConnection>;

export const externalInfisicalConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: TActorContext): Promise<TRemoteProject[]> => {
    const appConnection = await getAppConnection(AppConnection.ExternalInfisical, connectionId, actor);
    return listRemoteProjects(appConnection);
  };

  const getEnvironmentFolderTree = async (
    connectionId: string,
    projectId: string,
    actor: TActorContext
  ): Promise<TRemoteEnvironmentFolderTree> => {
    const appConnection = await getAppConnection(AppConnection.ExternalInfisical, connectionId, actor);
    return getRemoteEnvironmentFolderTree(appConnection, projectId);
  };

  return {
    listProjects,
    getEnvironmentFolderTree
  };
};
