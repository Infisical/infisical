import {
  Cloud66SyncSchema,
  CreateCloud66SyncSchema,
  UpdateCloud66SyncSchema
} from "@app/services/secret-sync/cloud66/cloud66-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerCloud66SyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Cloud66,
    server,
    responseSchema: Cloud66SyncSchema,
    createSchema: CreateCloud66SyncSchema,
    updateSchema: UpdateCloud66SyncSchema
  });
