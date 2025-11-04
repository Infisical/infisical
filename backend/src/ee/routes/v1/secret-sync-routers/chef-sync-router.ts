import { ChefSyncSchema, CreateChefSyncSchema, UpdateChefSyncSchema } from "@app/ee/services/secret-sync/chef";
import { registerSyncSecretsEndpoints } from "@app/server/routes/v1/secret-sync-routers/secret-sync-endpoints";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

export const registerChefSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Chef,
    server,
    responseSchema: ChefSyncSchema,
    createSchema: CreateChefSyncSchema,
    updateSchema: UpdateChefSyncSchema
  });
