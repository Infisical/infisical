import { CreateGcpSyncSchema, GcpSyncSchema, UpdateGcpSyncSchema } from "@app/services/secret-sync/gcp";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerGcpSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.GCPSecretManager,
    server,
    responseSchema: GcpSyncSchema,
    createSchema: CreateGcpSyncSchema,
    updateSchema: UpdateGcpSyncSchema
  });
