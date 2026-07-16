import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listHasuraCloudProjects } from "./hasura-cloud-connection-fns";
import { THasuraCloudConnection } from "./hasura-cloud-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<THasuraCloudConnection>;

export const hasuraCloudConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.HasuraCloud, connectionId, actor);
    try {
      const projects = await listHasuraCloudProjects(appConnection);

      return projects;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Hasura Cloud");
      return [];
    }
  };

  return {
    listProjects
  };
};
