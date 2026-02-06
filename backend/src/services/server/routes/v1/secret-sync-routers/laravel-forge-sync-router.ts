import {
  CreateLaravelForgeSyncSchema,
  LaravelForgeSyncSchema,
  UpdateLaravelForgeSyncSchema
} from "@app/services/secret-sync/laravel-forge";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerLaravelForgeSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.LaravelForge,
    server,
    responseSchema: LaravelForgeSyncSchema,
    createSchema: CreateLaravelForgeSyncSchema,
    updateSchema: UpdateLaravelForgeSyncSchema
  });
