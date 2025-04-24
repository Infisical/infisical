import { CamundaSyncSchema, CreateCamundaSyncSchema, UpdateCamundaSyncSchema } from "@app/services/secret-sync/camunda";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerCamundaSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Camunda,
    server,
    responseSchema: CamundaSyncSchema,
    createSchema: CreateCamundaSyncSchema,
    updateSchema: UpdateCamundaSyncSchema
  });
