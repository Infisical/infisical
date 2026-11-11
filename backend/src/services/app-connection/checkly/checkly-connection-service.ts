import { TActorContext } from "@app/domains/lib/actor-context";
import { logger } from "@app/lib/logger";

import { AppConnection } from "../app-connection-enums";
import { ChecklyPublicAPI } from "./checkly-connection-public-client";
import { TChecklyConnection } from "./checkly-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TChecklyConnection>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const checklyConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listAccounts = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Checkly, connectionId, actor);
    try {
      const accounts = await ChecklyPublicAPI.getChecklyAccounts(appConnection);
      return accounts!;
    } catch (error) {
      logger.error(error, "Failed to list accounts on Checkly");
      return [];
    }
  };

  const listGroups = async (connectionId: string, accountId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.Checkly, connectionId, actor);
    try {
      const groups = await ChecklyPublicAPI.getCheckGroups(appConnection, accountId);
      return groups!;
    } catch (error) {
      logger.error(error, "Failed to list accounts on Checkly");
      return [];
    }
  };

  return {
    listAccounts,
    listGroups
  };
};
