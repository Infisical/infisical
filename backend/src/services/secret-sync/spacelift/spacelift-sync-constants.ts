import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const SPACELIFT_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Spacelift",
  destination: SecretSync.Spacelift,
  connection: AppConnection.Spacelift,
  canImportSecrets: false,
  canRemoveSecretsOnDeletion: true
};
