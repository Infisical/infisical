import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const AZURE_DEVOPS_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Azure DevOps",
  destination: SecretSync.AzureDevOps,
  connection: AppConnection.AzureDevOps,
  canImportSecrets: false
};
