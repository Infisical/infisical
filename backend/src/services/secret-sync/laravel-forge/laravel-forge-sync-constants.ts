import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const LARAVEL_FORGE_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Laravel Forge",
  destination: SecretSync.LaravelForge,
  connection: AppConnection.LaravelForge,
  canImportSecrets: true
};
