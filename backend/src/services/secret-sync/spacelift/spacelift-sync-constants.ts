import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export enum SpaceliftConfigType {
  EnvironmentVariable = "environment-variable",
  FileMount = "file-mount"
}

export enum SpaceliftFileMountFormat {
  DotEnv = "dot-env",
  SecretPerFile = "secret-per-file"
}

export const SPACELIFT_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Spacelift",
  destination: SecretSync.Spacelift,
  connection: AppConnection.Spacelift,
  canImportSecrets: true,
  canRemoveSecretsOnDeletion: true
};
