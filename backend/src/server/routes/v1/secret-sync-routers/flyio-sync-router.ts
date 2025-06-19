import { CreateFlyioSyncSchema, FlyioSyncSchema, UpdateFlyioSyncSchema } from "@app/services/secret-sync/flyio";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerFlyioSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Flyio,
    server,
    responseSchema: FlyioSyncSchema,
    createSchema: CreateFlyioSyncSchema,
    updateSchema: UpdateFlyioSyncSchema
  });
