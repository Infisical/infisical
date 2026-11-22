import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const JENKINS_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Jenkins",
  destination: SecretSync.Jenkins,
  connection: AppConnection.Jenkins,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: false
};
