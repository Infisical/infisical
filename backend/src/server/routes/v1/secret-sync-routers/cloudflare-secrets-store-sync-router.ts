import {
  CloudflareSecretsStoreSyncSchema,
  CreateCloudflareSecretsStoreSyncSchema,
  UpdateCloudflareSecretsStoreSyncSchema
} from "@app/services/secret-sync/cloudflare-secrets-store/cloudflare-secrets-store-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerCloudflareSecretsStoreSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.CloudflareSecretsStore,
    server,
    responseSchema: CloudflareSecretsStoreSyncSchema,
    createSchema: CreateCloudflareSecretsStoreSyncSchema,
    updateSchema: UpdateCloudflareSecretsStoreSyncSchema
  });
