import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  CreateTriggerDevSyncSchema,
  TriggerDevSyncSchema,
  UpdateTriggerDevSyncSchema
} from "@app/services/secret-sync/trigger-dev";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerTriggerDevSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.TriggerDev,
    server,
    responseSchema: TriggerDevSyncSchema,
    createSchema: CreateTriggerDevSyncSchema,
    updateSchema: UpdateTriggerDevSyncSchema
  });
