import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const KOYEB_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Koyeb",
  destination: SecretSync.Koyeb,
  connection: AppConnection.Koyeb,
  canImportSecrets: false
};
