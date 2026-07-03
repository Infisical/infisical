import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listGiteaOrganizations, listGiteaRepositories } from "./gitea-connection-fns";
import { TGiteaConnection } from "./gitea-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGiteaConnection>;

export const giteaConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listOrganizations = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Gitea, connectionId, actor);
    try {
      const organizations = await listGiteaOrganizations(appConnection);
      return organizations;
    } catch (error) {
      logger.error(error, `Failed to establish connection with Gitea for app ${connectionId}`);
      return [];
    }
  };

  const listRepositories = async (connectionId: string, actor: OrgServiceActor, search?: string, limit?: number) => {
    const appConnection = await getAppConnection(AppConnection.Gitea, connectionId, actor);
    try {
      const repositories = await listGiteaRepositories(appConnection, search, limit);
      return repositories;
    } catch (error) {
      logger.error(error, `Failed to establish connection with Gitea for app ${connectionId}`);
      return [];
    }
  };

  return {
    listOrganizations,
    listRepositories
  };
};
