import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listDenoDeployApps } from "./deno-deploy-connection-fns";
import { TDenoDeployConnection } from "./deno-deploy-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TDenoDeployConnection>;

export const denoDeployConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listApps = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.DenoDeploy, connectionId, actor);

    try {
      const apps = await listDenoDeployApps(appConnection);
      return apps;
    } catch (error) {
      logger.error(error, "Failed to list Deno Deploy apps");
      return [];
    }
  };

  return {
    listApps
  };
};
