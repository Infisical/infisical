import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { listFireworksUsers } from "./fireworks-connection-fns";
import { TFireworksConnection } from "./fireworks-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TFireworksConnection>;

export const fireworksConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listServiceAccounts = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Fireworks, connectionId, actor);
    try {
      const users = await listFireworksUsers(appConnection);
      return users ?? [];
    } catch (error) {
      logger.error(error, "Failed to list Fireworks service accounts");
      return [];
    }
  };

  return {
    listServiceAccounts
  };
};
