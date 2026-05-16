import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  CreateSnowflakeSyncSchema,
  SnowflakeSyncSchema,
  UpdateSnowflakeSyncSchema
} from "@app/services/secret-sync/snowflake";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerSnowflakeSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Snowflake,
    server,
    responseSchema: SnowflakeSyncSchema,
    createSchema: CreateSnowflakeSyncSchema,
    updateSchema: UpdateSnowflakeSyncSchema
  });
