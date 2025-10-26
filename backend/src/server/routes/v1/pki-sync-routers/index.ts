import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerAwsCertificateManagerPkiSyncRouter } from "./aws-certificate-manager-pki-sync-router";
import { registerAzureKeyVaultPkiSyncRouter } from "./azure-key-vault-pki-sync-router";

export * from "./pki-sync-router";

export const PKI_SYNC_REGISTER_ROUTER_MAP: Record<PkiSync, (server: FastifyZodProvider) => Promise<void>> = {
  [PkiSync.AzureKeyVault]: registerAzureKeyVaultPkiSyncRouter,
  [PkiSync.AwsCertificateManager]: registerAwsCertificateManagerPkiSyncRouter
};
