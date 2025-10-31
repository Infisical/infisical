import {
  CreateNorthflankSyncSchema,
  NorthflankSyncSchema,
  UpdateNorthflankSyncSchema
} from "@app/services/secret-sync/northflank";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerNorthflankSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Northflank,
    server,
    responseSchema: NorthflankSyncSchema,
    createSchema: CreateNorthflankSyncSchema,
    updateSchema: UpdateNorthflankSyncSchema
  });
