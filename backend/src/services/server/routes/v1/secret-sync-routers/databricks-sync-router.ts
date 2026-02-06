import {
  CreateDatabricksSyncSchema,
  DatabricksSyncSchema,
  UpdateDatabricksSyncSchema
} from "@app/services/secret-sync/databricks";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerDatabricksSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Databricks,
    server,
    responseSchema: DatabricksSyncSchema,
    createSchema: CreateDatabricksSyncSchema,
    updateSchema: UpdateDatabricksSyncSchema
  });
