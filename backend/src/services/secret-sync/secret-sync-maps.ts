import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

export const SECRET_SYNC_NAME_MAP: Record<SecretSync, string> = {
  [SecretSync.AWSParameterStore]: "AWS Parameter Store",
  [SecretSync.GitHub]: "GitHub",
  [SecretSync.GCPSecretManager]: "GCP Secret Manager"
};

export const SECRET_SYNC_CONNECTION_MAP: Record<SecretSync, AppConnection> = {
  [SecretSync.AWSParameterStore]: AppConnection.AWS,
  [SecretSync.GitHub]: AppConnection.GitHub,
  [SecretSync.GCPSecretManager]: AppConnection.GCP
};
