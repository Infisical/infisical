import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const SNOWFLAKE_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Snowflake",
  destination: SecretSync.Snowflake,
  connection: AppConnection.Snowflake,
  canImportSecrets: false,
  canRemoveSecretsOnDeletion: true
};
