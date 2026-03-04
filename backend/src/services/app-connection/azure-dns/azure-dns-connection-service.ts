import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listAzureDnsZones } from "./azure-dns-connection-fns";
import { TAzureDnsConnection } from "./azure-dns-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TAzureDnsConnection>;

export const azureDnsConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listZones = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.AzureDNS, connectionId, actor);
    try {
      const zones = await listAzureDnsZones(appConnection);
      return zones;
    } catch (error) {
      logger.error(error, `Failed to list Azure DNS zones for Azure DNS connection [connectionId=${connectionId}]`);
      throw new BadRequestError({
        message: `Failed to list Azure DNS zones: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };

  return {
    listZones
  };
};
