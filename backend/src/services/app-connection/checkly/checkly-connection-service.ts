import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { ChecklyPublicAPI } from "./checkly-connection-public-client";
import { TChecklyConnection } from "./checkly-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TChecklyConnection>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const checklyConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listAccounts = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Checkly, connectionId, actor);
    try {
      const accounts = await ChecklyPublicAPI.getChecklyAccounts(appConnection);
      return accounts!;
    } catch (error) {
      logger.error(error, "Failed to list accounts on Checkly");
      return [];
    }
  };

  return {
    listAccounts
  };
};
