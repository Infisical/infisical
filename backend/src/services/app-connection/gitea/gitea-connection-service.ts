import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listGiteaRepositories } from "./gitea-connection-fns";
import { TGiteaConnection } from "./gitea-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TGiteaConnection>;

export const giteaConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listRepositories = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Gitea, connectionId, actor);
    try {
      return await listGiteaRepositories(appConnection);
    } catch (error) {
      logger.error(error, `Failed to list Gitea repositories [connectionId=${connectionId}]`);
      return [];
    }
  };

  return {
    listRepositories
  };
};
