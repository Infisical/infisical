import { BadRequestError } from "@app/lib/errors";
import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listDNSMadeEasyZones } from "./dns-made-easy-connection-fns";
import { TDNSMadeEasyConnection } from "./dns-made-easy-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TDNSMadeEasyConnection>;

export const dnsMadeEasyConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listZones = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.DNSMadeEasy, connectionId, actor);
    try {
      const zones = await listDNSMadeEasyZones(appConnection);
      return zones;
    } catch (error) {
      logger.error(
        error,
        `Failed to list DNS Made Easy zones for DNS Made Easy connection [connectionId=${connectionId}]`
      );
      throw new BadRequestError({
        message: `Failed to list DNS Made Easy zones: ${error instanceof Error ? error.message : "Unknown error"}`
      });
    }
  };

  return {
    listZones
  };
};
