import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export enum CloudflareWorkersVariableType {
  Secret = "secret_text",
  Text = "plain_text",
  Json = "json"
}

export const CLOUDFLARE_WORKERS_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Cloudflare Workers",
  destination: SecretSync.CloudflareWorkers,
  connection: AppConnection.Cloudflare,
  canRemoveSecretsOnDeletion: true,
  canImportSecrets: false
};
