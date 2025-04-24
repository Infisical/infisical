import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const AZURE_KEY_VAULT_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Azure Key Vault",
  destination: SecretSync.AzureKeyVault,
  connection: AppConnection.AzureKeyVault,
  canImportSecrets: true
};
