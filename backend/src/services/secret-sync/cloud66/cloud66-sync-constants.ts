import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const CLOUD66_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Cloud 66",
  destination: SecretSync.Cloud66,
  connection: AppConnection.Cloud66,
  canImportSecrets: true,
  canRemoveSecretsOnDeletion: true
};
