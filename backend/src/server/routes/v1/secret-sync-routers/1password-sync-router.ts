import {
  CreateOnePassSyncSchema,
  OnePassSyncSchema,
  UpdateOnePassSyncSchema
} from "@app/services/secret-sync/1password";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerOnePassSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.OnePass,
    server,
    responseSchema: OnePassSyncSchema,
    createSchema: CreateOnePassSyncSchema,
    updateSchema: UpdateOnePassSyncSchema
  });
