import { CreateOnaSyncSchema, OnaSyncSchema, UpdateOnaSyncSchema } from "@app/services/secret-sync/ona";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerOnaSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Ona,
    server,
    responseSchema: OnaSyncSchema,
    createSchema: CreateOnaSyncSchema,
    updateSchema: UpdateOnaSyncSchema
  });
