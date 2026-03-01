import { OrgServiceActor } from "@app/lib/types";

import { AppConnection } from "../app-connection-enums";
import { TKoyebConnection } from "./koyeb-connection-types";

type TGetAppConnectionFunc = (
  app: AppConnection,
  connectionId: string,
  actor: OrgServiceActor
) => Promise<TKoyebConnection>;

// Koyeb secrets are org-wide, no extra service methods needed beyond basic CRUD
export const koyebConnectionService = (_getAppConnection: TGetAppConnectionFunc) => {
  return {};
};
