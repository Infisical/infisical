import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const OCTOPUS_DEPLOY_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Octopus Deploy",
  destination: SecretSync.OctopusDeploy,
  connection: AppConnection.OctopusDeploy,
  canImportSecrets: false
};
