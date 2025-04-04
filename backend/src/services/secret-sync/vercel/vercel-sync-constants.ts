import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const VERCEL_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Vercel",
  destination: SecretSync.Vercel,
  connection: AppConnection.Vercel,
  canImportSecrets: true
};
