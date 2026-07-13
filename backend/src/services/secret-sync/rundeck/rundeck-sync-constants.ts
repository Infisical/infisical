import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const RUNDECK_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Rundeck",
  destination: SecretSync.Rundeck,
  connection: AppConnection.Rundeck,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: false
};
