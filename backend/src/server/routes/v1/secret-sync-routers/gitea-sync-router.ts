import { CreateGiteaSyncSchema, GiteaSyncSchema, UpdateGiteaSyncSchema } from "@app/services/secret-sync/gitea";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerGiteaSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Gitea,
    server,
    responseSchema: GiteaSyncSchema,
    createSchema: CreateGiteaSyncSchema,
    updateSchema: UpdateGiteaSyncSchema
  });
