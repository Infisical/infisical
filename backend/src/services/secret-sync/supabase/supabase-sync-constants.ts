import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const SUPABASE_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Supabase",
  destination: SecretSync.Supabase,
  connection: AppConnection.Supabase,
  canImportSecrets: false
};
