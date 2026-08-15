import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const PORTAINER_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Portainer",
  destination: SecretSync.Portainer,
  connection: AppConnection.Portainer,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: true
};
