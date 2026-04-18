import { CreateDevinSyncSchema, DevinSyncSchema, UpdateDevinSyncSchema } from "@app/services/secret-sync/devin";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerDevinSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Devin,
    server,
    responseSchema: DevinSyncSchema,
    createSchema: CreateDevinSyncSchema,
    updateSchema: UpdateDevinSyncSchema
  });
