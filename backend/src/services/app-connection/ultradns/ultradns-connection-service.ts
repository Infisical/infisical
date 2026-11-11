import { TActorContext } from "@app/domains/lib/actor-context";

import { AppConnection } from "../app-connection-enums";
import { listUltraDNSZones } from "./ultradns-connection-fns";
import { TUltraDNSConnection } from "./ultradns-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: TActorContext
) => Promise<TUltraDNSConnection>;

export const ultraDNSConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  const listZones = async (connectionId: string, actor: TActorContext) => {
    const appConnection = await getAppConnection(AppConnection.UltraDNS, connectionId, actor);
    return listUltraDNSZones(appConnection);
  };

  return {
    listZones
  };
};
