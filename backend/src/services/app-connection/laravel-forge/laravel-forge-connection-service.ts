import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TLaravelForgeConnection } from "./laravel-forge-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TLaravelForgeConnection>;

export const laravelForgeConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  console.log("laravelForgeConnectionService", getAppConnection);
};
