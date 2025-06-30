import { logger } from "@app/lib/logger";
import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listZabbixHosts } from "./zabbix-connection-fns";
import { TZabbixConnection } from "./zabbix-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TZabbixConnection>;

export const zabbixConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listHosts = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.Zabbix, connectionId, actor);

    try {
      const hosts = await listZabbixHosts(appConnection);
      return hosts;
    } catch (error) {
      logger.error(error, "Failed to establish connection with zabbix");
      return [];
    }
  };

  return {
    listHosts
  };
};
