import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listPortainerEnvironments, listPortainerStacks } from "./portainer-connection-fns";
import { TPortainerConnection } from "./portainer-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TPortainerConnection>;

export const portainerConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listEnvironments = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Portainer, connectionId, actor);
    try {
      const environments = await listPortainerEnvironments(appConnection);

      return environments;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Portainer");
      return [];
    }
  };

  const listStacks = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Portainer, connectionId, actor);
    try {
      const stacks = await listPortainerStacks(appConnection);

      return stacks;
    } catch (error) {
      logger.error(error, "Failed to establish connection with Portainer");
      return [];
    }
  };

  return {
    listEnvironments,
    listStacks
  };
};
