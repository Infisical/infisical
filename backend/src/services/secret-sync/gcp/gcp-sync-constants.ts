import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const GCP_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "GCP Secret Manager",
  destination: SecretSync.GCPSecretManager,
  connection: AppConnection.GCP,
  canImportSecrets: true
};
