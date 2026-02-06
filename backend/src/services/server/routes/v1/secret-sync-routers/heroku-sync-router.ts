import { CreateHerokuSyncSchema, HerokuSyncSchema, UpdateHerokuSyncSchema } from "@app/services/secret-sync/heroku";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerHerokuSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Heroku,
    server,
    responseSchema: HerokuSyncSchema,
    createSchema: CreateHerokuSyncSchema,
    updateSchema: UpdateHerokuSyncSchema
  });
