import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  ConvexSyncSchema,
  CreateConvexSyncSchema,
  UpdateConvexSyncSchema
} from "@app/services/secret-sync/convex";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerConvexSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Convex,
    server,
    responseSchema: ConvexSyncSchema,
    createSchema: CreateConvexSyncSchema,
    updateSchema: UpdateConvexSyncSchema
  });
