import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const ONEPASS_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "1Password",
  destination: SecretSync.OnePass,
  connection: AppConnection.OnePass,
  canImportSecrets: true
};
