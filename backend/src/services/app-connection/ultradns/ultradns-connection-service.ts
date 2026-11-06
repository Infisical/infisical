import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { listUltraDNSZones } from "./ultradns-connection-fns";
import { TUltraDNSConnection } from "./ultradns-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TUltraDNSConnection>;

export const ultraDNSConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listZones = async (connectionId: string, actor: OrgServiceActor) => {
    const appConnection = await getAppConnection(AppConnection.UltraDNS, connectionId, actor);
    return listUltraDNSZones(appConnection);
  };

  return {
    listZones
  };
};
