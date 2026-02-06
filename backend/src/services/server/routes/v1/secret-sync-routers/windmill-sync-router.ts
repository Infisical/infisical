import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";
import {
  CreateWindmillSyncSchema,
  UpdateWindmillSyncSchema,
  WindmillSyncSchema
} from "@app/services/secret-sync/windmill";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerWindmillSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Windmill,
    server,
    responseSchema: WindmillSyncSchema,
    createSchema: CreateWindmillSyncSchema,
    updateSchema: UpdateWindmillSyncSchema
  });
