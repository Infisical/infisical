import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const GCP_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "GCP",
  destination: SecretSync.GCP,
  connection: AppConnection.GCP,
  canImportSecrets: false
};
