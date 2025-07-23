import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const BITBUCKET_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Bitbucket",
  destination: SecretSync.Bitbucket,
  connection: AppConnection.Bitbucket,
  canImportSecrets: false
};
