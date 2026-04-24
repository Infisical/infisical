import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const TRAVIS_CI_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Travis CI",
  destination: SecretSync.TravisCI,
  connection: AppConnection.TravisCI,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: false
};
