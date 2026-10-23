import { AppConnection } from "@app/services/app-connection/app-connection-enums";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { TSecretSyncListItem } from "@app/services/secret-sync/secret-sync-types";

export enum CloudflareSecretsStoreScope {
  Workers = "workers",
  AiGateway = "ai_gateway",
  Containers = "containers"
}

export const CLOUDFLARE_SECRETS_STORE_SYNC_LIST_OPTION: TSecretSyncListItem = {
  name: "Cloudflare Secrets Store",
  destination: SecretSync.CloudflareSecretsStore,
  connection: AppConnection.Cloudflare,
  canImportSecrets: false,
  canRemoveSecretsOnDeletion: true
};
