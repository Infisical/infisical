import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const OCI_VAULT_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "OCI Vault",
  destination: SecretSync.OCIVault,
  connection: AppConnection.OCI,
  canImportSecrets: true,
  enterprise: true
};
