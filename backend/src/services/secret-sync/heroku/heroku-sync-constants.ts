import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const HEROKU_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Heroku",
  destination: SecretSync.Heroku,
  connection: AppConnection.Heroku,
  canImportSecrets: true
};
