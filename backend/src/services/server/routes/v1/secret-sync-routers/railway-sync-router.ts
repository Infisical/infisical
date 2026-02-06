import {
  CreateRailwaySyncSchema,
  RailwaySyncSchema,
  UpdateRailwaySyncSchema
} from "@app/services/secret-sync/railway/railway-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerRailwaySyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Railway,
    server,
    responseSchema: RailwaySyncSchema,
    createSchema: CreateRailwaySyncSchema,
    updateSchema: UpdateRailwaySyncSchema
  });
