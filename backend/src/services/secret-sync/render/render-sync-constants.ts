import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const RENDER_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Render",
  destination: SecretSync.Render,
  connection: AppConnection.Render,
  canImportSecrets: true
};
