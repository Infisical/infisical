import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { NetlifyPublicAPI } from "./netlify-connection-public-client";
import { TNetlifyConnection } from "./netlify-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TNetlifyConnection>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const netlifyConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listAccounts = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Netlify, connectionId, actor);
    try {
      const accounts = await NetlifyPublicAPI.getNetlifyAccounts(appConnection);
      return accounts!;
    } catch (error) {
      logger.error(error, "Failed to list accounts on Netlify");
      return [];
    }
  };

  const listSites = async (connectionId: string, actor: OrgServiceActor, accountId: string) => {
    const appConnection = await getAppConnection(AppConnection.Netlify, connectionId, actor);
    try {
      const sites = await NetlifyPublicAPI.getSites(appConnection, accountId);
      return sites!;
    } catch (error) {
      logger.error(error, "Failed to list sites on Netlify");
      return [];
    }
  };

  return {
    listAccounts,
    listSites
  };
};
