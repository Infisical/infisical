import { CreateOvhSyncSchema, OvhSyncSchema, UpdateOvhSyncSchema } from "@app/services/secret-sync/ovh";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerOvhSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.OVH,
    server,
    responseSchema: OvhSyncSchema,
    createSchema: CreateOvhSyncSchema,
    updateSchema: UpdateOvhSyncSchema
  });
