import {
  CreateKeeperSyncSchema,
  KeeperSyncSchema,
  UpdateKeeperSyncSchema
} from "@app/services/secret-sync/keeper/keeper-sync-schemas";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerKeeperSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.Keeper,
    server,
    responseSchema: KeeperSyncSchema,
    createSchema: CreateKeeperSyncSchema,
    updateSchema: UpdateKeeperSyncSchema
  });
