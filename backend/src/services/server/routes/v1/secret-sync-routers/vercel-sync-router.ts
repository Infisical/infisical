import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import { CreateVercelSyncSchema, UpdateVercelSyncSchema, VercelSyncSchema } from "@app/services/secret-sync/vercel";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerVercelSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Vercel,
    server,
    responseSchema: VercelSyncSchema,
    createSchema: CreateVercelSyncSchema,
    updateSchema: UpdateVercelSyncSchema
  });
