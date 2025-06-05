import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";
import { CoolifySyncSchema, CreateCoolifySyncSchema, UpdateCoolifySyncSchema } from "@app/services/secret-sync/coolify";

export const registerCoolifySyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Coolify,
    server,
    responseSchema: CoolifySyncSchema,
    createSchema: CreateCoolifySyncSchema,
    updateSchema: UpdateCoolifySyncSchema
  });
