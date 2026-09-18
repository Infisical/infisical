import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const HASURA_CLOUD_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Hasura Cloud",
  destination: SecretSync.HasuraCloud,
  connection: AppConnection.HasuraCloud,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: true
};
