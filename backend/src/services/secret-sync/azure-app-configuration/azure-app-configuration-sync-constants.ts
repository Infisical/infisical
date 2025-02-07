import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const AZURE_APP_CONFIGURATION_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Azure App Configuration",
  destination: SecretSync.AzureAppConfiguration,
  connection: AppConnection.AzureAppConfiguration,
  canImportSecrets: true
};
