import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const AWS_SECRETS_MANAGER_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "AWS Secrets Manager",
  destination: SecretSync.AWSSecretsManager,
  connection: AppConnection.AWS,
  canImportSecrets: true
};
