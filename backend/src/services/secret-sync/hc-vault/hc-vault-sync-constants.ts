import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const HC_VAULT_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Hashicorp Vault",
  destination: SecretSync.HCVault,
  connection: AppConnection.HCVault,
  canImportSecrets: true
};
