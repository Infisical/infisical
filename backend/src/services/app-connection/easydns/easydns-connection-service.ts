import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TEasyDNSConnection } from "./easydns-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TEasyDNSConnection>;

export const easyDNSConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  return {};
};
