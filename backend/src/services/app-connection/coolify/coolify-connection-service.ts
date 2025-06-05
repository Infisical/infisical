import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TCoolifyConnection } from "./coolify-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TCoolifyConnection>;

export const coolifyConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  return {};
};
