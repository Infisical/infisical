import {
  CreateExternalInfisicalSyncSchema,
  ExternalInfisicalSyncSchema,
  UpdateExternalInfisicalSyncSchema
} from "@app/services/secret-sync/external-infisical";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerExternalInfisicalSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.ExternalInfisical,
    server,
    responseSchema: ExternalInfisicalSyncSchema,
    createSchema: CreateExternalInfisicalSyncSchema,
    updateSchema: UpdateExternalInfisicalSyncSchema
  });
