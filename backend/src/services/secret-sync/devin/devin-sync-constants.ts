import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const DEVIN_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Devin",
  destination: SecretSync.Devin,
  connection: AppConnection.Devin,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: false
};
