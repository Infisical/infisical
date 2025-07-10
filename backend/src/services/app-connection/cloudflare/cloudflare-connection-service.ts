import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listCloudflarePagesProjects, listCloudflareWorkersScripts } from "./cloudflare-connection-fns";
import { TCloudflareConnection } from "./cloudflare-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCloudflareConnection>;

export const cloudflareConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listPagesProjects = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloudflare, connectionId, actor);
    try {
      const projects = await listCloudflarePagesProjects(appConnection);

      return projects;
    } catch (error) {
      logger.error(
        error,
        `Failed to list Cloudflare Pages projects for Cloudflare connection [connectionId=${connectionId}]`
      );
      return [];
    }
  };

  const listWorkersScripts = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Cloudflare, connectionId, actor);
    try {
      const projects = await listCloudflareWorkersScripts(appConnection);

      return projects;
    } catch (error) {
      logger.error(
        error,
        `Failed to list Cloudflare Workers scripts for Cloudflare connection [connectionId=${connectionId}]`
      );
      return [];
    }
  };

  return {
    listPagesProjects,
    listWorkersScripts
  };
};
