import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listConvexDeployments } from "./convex-connection-fns";
import { TConvexConnection } from "./convex-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TConvexConnection>;

export const convexConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listDeployments = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Convex, connectionId, actor);

    try {
      return await listConvexDeployments(appConnection);
    } catch (error) {
      logger.error(error, "Failed to list Convex deployments");
      return [];
    }
  };

  return {
    listDeployments
  };
};
