import {
  CreateGcpCertificateManagerPkiSyncSchema,
  GCP_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION,
  GcpCertificateManagerPkiSyncSchema,
  UpdateGcpCertificateManagerPkiSyncSchema
} from "@app/services/pki-sync/gcp-certificate-manager";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerGcpCertificateManagerPkiSyncRouter = async (
  server: FastifyZodProvider,
  enableOperationId: boolean = true
) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.GcpCertificateManager,
    server,
    responseSchema: GcpCertificateManagerPkiSyncSchema,
    createSchema: CreateGcpCertificateManagerPkiSyncSchema,
    updateSchema: UpdateGcpCertificateManagerPkiSyncSchema,
    syncOptions: {
      canImportCertificates: GCP_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: GCP_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });
