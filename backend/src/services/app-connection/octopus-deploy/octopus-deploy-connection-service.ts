import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TOctopusDeployConnection } from "./octopus-deploy-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TOctopusDeployConnection>;

export const octopusDeployConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  console.log("octopusDeployConnectionService", getAppConnection);
  return {};
};
