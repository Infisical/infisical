import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const RAILWAY_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Railway",
  destination: SecretSync.Railway,
  connection: AppConnection.Railway,
  canImportSecrets: true
};
