import {
  AzureKeyVaultSyncSchema,
  CreateAzureKeyVaultSyncSchema,
  UpdateAzureKeyVaultSyncSchema
} from "@app/services/secret-sync/azure-key-vault";
import { SecretSync } from "@app/services/secret-sync/secret-sync-enums";

import { registerSyncSecretsEndpoints } from "./secret-sync-endpoints";

export const registerAzureKeyVaultSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncSecretsEndpoints({
    destination: SecretSync.AzureKeyVault,
    server,
    responseSchema: AzureKeyVaultSyncSchema,
    createSchema: CreateAzureKeyVaultSyncSchema,
    updateSchema: UpdateAzureKeyVaultSyncSchema
  });
