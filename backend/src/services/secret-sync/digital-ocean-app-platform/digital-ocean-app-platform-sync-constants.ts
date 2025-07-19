import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const DIGITAL_OCEAN_APP_PLATFORM_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Digital Ocean App Platform" as const,
  destination: SecretSync.DigitalOceanAppPlatform,
  connection: AppConnection.DigitalOcean,
  canImportSecrets: false
};
