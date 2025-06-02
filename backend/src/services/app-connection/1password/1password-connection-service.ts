import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listOnePassVaults } from "./1password-connection-fns";
import { TOnePassConnection } from "./1password-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TOnePassConnection>;

export const onePassConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listVaults = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.OnePass, connectionId, actor);

    try {
      const vaults = await listOnePassVaults(appConnection);
      return vaults;
    } catch (error) {
      logger.error(error, "Failed to establish connection with 1Password");
      return [];
    }
  };

  return {
    listVaults
  };
};
