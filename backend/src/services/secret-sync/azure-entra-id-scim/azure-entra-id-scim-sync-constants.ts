import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const AZURE_ENTRA_ID_SCIM_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Azure Entra ID SCIM",
  destination: SecretSync.AzureEntraIdScim,
  connection: AppConnection.AzureEntraId,
  canImportSecrets: false,
  supportsKeySchema: false,
  canRemoveSecretsOnDeletion: false,
  supportsDisableSecretDeletion: false
};
