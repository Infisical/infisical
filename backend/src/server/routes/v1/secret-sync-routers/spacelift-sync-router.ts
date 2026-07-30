import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  CreateSpaceliftSyncSchema,
  SpaceliftSyncSchema,
  UpdateSpaceliftSyncSchema
} from "@app/services/secret-sync/spacelift";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerSpaceliftSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Spacelift,
    server,
    responseSchema: SpaceliftSyncSchema,
    createSchema: CreateSpaceliftSyncSchema,
    updateSchema: UpdateSpaceliftSyncSchema
  });
