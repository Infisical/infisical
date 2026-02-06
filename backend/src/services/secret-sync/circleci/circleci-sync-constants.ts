import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { TCircleCISyncListItem } from "./circleci-sync-types";

export const CIRCLECI_SYNC_LIST_OPTION: TCircleCISyncListItem = {
  name: "CircleCI",
  destination: SecretSync.CircleCI,
  connection: AppConnection.CircleCI,
  canImportSecrets: false
};
