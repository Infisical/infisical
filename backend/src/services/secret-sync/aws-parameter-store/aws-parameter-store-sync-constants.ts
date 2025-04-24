import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const AWS_PARAMETER_STORE_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "AWS Parameter Store",
  destination: SecretSync.AWSParameterStore,
  connection: AppConnection.AWS,
  canImportSecrets: true
};
