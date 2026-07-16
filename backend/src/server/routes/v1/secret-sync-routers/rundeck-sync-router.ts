import { CreateRundeckSyncSchema, RundeckSyncSchema, UpdateRundeckSyncSchema } from "@app/services/secret-sync/rundeck";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerRundeckSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Rundeck,
    server,
    responseSchema: RundeckSyncSchema,
    createSchema: CreateRundeckSyncSchema,
    updateSchema: UpdateRundeckSyncSchema
  });
