import { CreateQoverySyncSchema, QoverySyncSchema, UpdateQoverySyncSchema } from "@app/services/secret-sync/qovery";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerQoverySyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Qovery,
    server,
    responseSchema: QoverySyncSchema,
    createSchema: CreateQoverySyncSchema,
    updateSchema: UpdateQoverySyncSchema
  });
