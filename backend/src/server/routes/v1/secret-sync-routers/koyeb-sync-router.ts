import {
  CreateKoyebSyncSchema,
  KoyebSyncSchema,
  UpdateKoyebSyncSchema
} from "@app/services/secret-sync/koyeb/koyeb-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerKoyebSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Koyeb,
    server,
    responseSchema: KoyebSyncSchema,
    createSchema: CreateKoyebSyncSchema,
    updateSchema: UpdateKoyebSyncSchema
  });
