import {
  CloudflareWorkersSyncSchema,
  CreateCloudflareWorkersSyncSchema,
  UpdateCloudflareWorkersSyncSchema
} from "@app/services/secret-sync/cloudflare-workers/cloudflare-workers-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerCloudflareWorkersSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.CloudflareWorkers,
    server,
    responseSchema: CloudflareWorkersSyncSchema,
    createSchema: CreateCloudflareWorkersSyncSchema,
    updateSchema: UpdateCloudflareWorkersSyncSchema
  });
