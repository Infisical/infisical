import {
  CreateDigitalOceanAppPlatformSyncSchema,
  DigitalOceanAppPlatformSyncSchema,
  UpdateDigitalOceanAppPlatformSyncSchema
} from "@app/services/secret-sync/digital-ocean-app-platform";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerDigitalOceanAppPlatformSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.DigitalOceanAppPlatform,
    server,
    responseSchema: DigitalOceanAppPlatformSyncSchema,
    createSchema: CreateDigitalOceanAppPlatformSyncSchema,
    updateSchema: UpdateDigitalOceanAppPlatformSyncSchema
  });
