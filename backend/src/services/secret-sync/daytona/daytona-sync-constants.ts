import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const DAYTONA_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Daytona",
  destination: SecretSync.Daytona,
  connection: AppConnection.Daytona,
  canImportSecrets: false,
  canRemoveSecretsOnDeletion: true
};
