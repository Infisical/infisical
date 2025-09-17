import {
  AzureKeyVaultPkiSyncSchema,
  CreateAzureKeyVaultPkiSyncSchema,
  UpdateAzureKeyVaultPkiSyncSchema
} from "@app/services/pki-sync/azure-key-vault";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerAzureKeyVaultPkiSyncRouter = async (server: FastifyZodProvider) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.AzureKeyVault,
    server,
    responseSchema: AzureKeyVaultPkiSyncSchema,
    createSchema: CreateAzureKeyVaultPkiSyncSchema,
    updateSchema: UpdateAzureKeyVaultPkiSyncSchema
  });
