import {
  CreateHumanitecSyncSchema,
  HumanitecSyncSchema,
  UpdateHumanitecSyncSchema
} from "@app/services/secret-sync/humanitec";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerHumanitecSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Humanitec,
    server,
    responseSchema: HumanitecSyncSchema,
    createSchema: CreateHumanitecSyncSchema,
    updateSchema: UpdateHumanitecSyncSchema
  });
