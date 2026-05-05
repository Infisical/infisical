import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const GITEA_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Gitea",
  destination: SecretSync.Gitea,
  connection: AppConnection.Gitea,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: false
};
