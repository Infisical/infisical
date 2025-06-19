import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const FLYIO_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Fly.io",
  destination: SecretSync.Flyio,
  connection: AppConnection.Flyio,
  canImportSecrets: false
};
