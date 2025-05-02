import {
  CreateHCVaultSyncSchema,
  HCVaultSyncSchema,
  UpdateHCVaultSyncSchema
} from "@app/services/secret-sync/hc-vault";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerHCVaultSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.HCVault,
    server,
    responseSchema: HCVaultSyncSchema,
    createSchema: CreateHCVaultSyncSchema,
    updateSchema: UpdateHCVaultSyncSchema
  });
