import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listDenoDeployApps, toDenoDeployProviderError } from "./deno-deploy-connection-fns";
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
      return await listDenoDeployApps(appConnection);
    } catch (error) {
      logger.error(error, "Failed to list Deno Deploy apps");
      throw toDenoDeployProviderError(error, "list Deno Deploy apps");
    }
  };

  return {
    listApps
  };
};
