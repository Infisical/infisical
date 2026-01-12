import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export enum TriggerDevEnvironment {
  Dev = "dev",
  Staging = "staging",
  Prod = "prod"
}

export const TRIGGER_DEV_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Trigger.dev",
  destination: SecretSync.TriggerDev,
  connection: AppConnection.TriggerDev,
  canImportSecrets: true
};
