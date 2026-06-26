import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const TRIGGER_DEV_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Trigger.dev",
  destination: SecretSync.TriggerDev,
  connection: AppConnection.TriggerDev,
  // Trigger.dev redacts secret values on read, so importing them back is not supported
  canImportSecrets: false,
  canRemoveSecretsOnDeletion: true
};
