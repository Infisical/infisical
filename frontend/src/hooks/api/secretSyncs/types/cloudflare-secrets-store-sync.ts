import { AppConnection } from "@app/hooks/api/appConnections/enums";
import { SecretSync } from "@app/hooks/api/secretSyncs";
import { TRootSecretSync } from "@app/hooks/api/secretSyncs/types/root-sync";

export enum CloudflareSecretsStoreScope {
  Workers = "workers",
  AiGateway = "ai_gateway",
  Containers = "containers"
}

export type TCloudflareSecretsStoreSync = TRootSecretSync & {
  destination: SecretSync.CloudflareSecretsStore;
  destinationConfig: {
    storeId: string;
    storeName?: string;
    scopes: CloudflareSecretsStoreScope[];
  };
  connection: {
    app: AppConnection.Cloudflare;
    name: string;
    id: string;
  };
};
