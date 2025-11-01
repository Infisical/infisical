import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const CHEF_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Chef",
  destination: SecretSync.Chef,
  connection: AppConnection.Chef,
  canImportSecrets: true
};
