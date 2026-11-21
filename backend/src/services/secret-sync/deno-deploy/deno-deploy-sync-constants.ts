import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const DENO_DEPLOY_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Deno Deploy",
  destination: SecretSync.DenoDeploy,
  connection: AppConnection.DenoDeploy,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: true
};
