import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const QOVERY_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Qovery",
  destination: SecretSync.Qovery,
  connection: AppConnection.Qovery,
  // Qovery secrets never return their value, so importing back into Infisical is not supported.
  canImportSecrets: false,
  canRemoveSecretsOnDeletion: true
};
