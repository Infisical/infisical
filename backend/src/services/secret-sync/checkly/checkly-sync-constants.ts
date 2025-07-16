import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const CHECKLY_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Checkly",
  destination: SecretSync.Checkly,
  connection: AppConnection.Checkly,
  canImportSecrets: false
};
