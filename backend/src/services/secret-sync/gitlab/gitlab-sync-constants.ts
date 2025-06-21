import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const GITLAB_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "GitLab",
  destination: SecretSync.GitLab,
  connection: AppConnection.GitLab,
  canImportSecrets: false
};
