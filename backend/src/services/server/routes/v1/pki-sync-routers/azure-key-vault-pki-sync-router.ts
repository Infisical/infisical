import {
  AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION,
  AzureKeyVaultPkiSyncSchema,
  CreateAzureKeyVaultPkiSyncSchema,
  UpdateAzureKeyVaultPkiSyncSchema
} from "@app/services/pki-sync/azure-key-vault";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerAzureKeyVaultPkiSyncRouter = async (
  server: FastifyZodProvider,
  enableOperationId: boolean = true
) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.AzureKeyVault,
    server,
    responseSchema: AzureKeyVaultPkiSyncSchema,
    createSchema: CreateAzureKeyVaultPkiSyncSchema,
    updateSchema: UpdateAzureKeyVaultPkiSyncSchema,
    syncOptions: {
      canImportCertificates: AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: AZURE_KEY_VAULT_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });
