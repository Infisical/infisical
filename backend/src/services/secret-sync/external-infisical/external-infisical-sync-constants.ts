import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const EXTERNAL_INFISICAL_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Infisical",
  destination: SecretSync.ExternalInfisical,
  connection: AppConnection.ExternalInfisical,
  canImportSecrets: true,
  canRemoveSecretsOnDeletion: true
};
