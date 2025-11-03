import { ChefSyncSchema, CreateChefSyncSchema, UpdateChefSyncSchema } from "@app/services/secret-sync/chef";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerChefSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Chef,
    server,
    responseSchema: ChefSyncSchema,
    createSchema: CreateChefSyncSchema,
    updateSchema: UpdateChefSyncSchema
  });
