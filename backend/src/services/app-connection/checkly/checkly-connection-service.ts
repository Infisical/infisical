import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TChecklyConnection } from "./checkly-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TChecklyConnection>;

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const checklyConnectionService = (getAppConnection: TGetAppConnectionFunc) => {
  return {};
};
