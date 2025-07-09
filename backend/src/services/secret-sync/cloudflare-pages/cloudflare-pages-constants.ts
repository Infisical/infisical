import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export const CLOUDFLARE_PAGES_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Cloudflare Pages",
  destination: SecretSync.CloudflarePages,
  connection: AppConnection.Cloudflare,
  canImportSecrets: false
};
