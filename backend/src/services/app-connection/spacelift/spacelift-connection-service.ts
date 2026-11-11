import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { listSpaceliftContexts as getSpaceliftContexts } from "./spacelift-connection-fns";
import { TSpaceliftConnection } from "./spacelift-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TSpaceliftConnection>;

export const spaceliftConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listContexts = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Spacelift, connectionId, actor);
    try {
      const contexts = await getSpaceliftContexts(appConnection);
      return contexts;
    } catch (error) {
      logger.error(error, "Failed to list Spacelift contexts");
      return [];
    }
  };

  return {
    listContexts
  };
};
