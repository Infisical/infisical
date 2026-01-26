import {
  AWS_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION,
  AwsCertificateManagerPkiSyncSchema,
  CreateAwsCertificateManagerPkiSyncSchema,
  UpdateAwsCertificateManagerPkiSyncSchema
} from "@app/services/pki-sync/aws-certificate-manager";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerAwsCertificateManagerPkiSyncRouter = async (
  server: FastifyZodProvider,
  enableOperationId: boolean = true
) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.AwsCertificateManager,
    server,
    responseSchema: AwsCertificateManagerPkiSyncSchema,
    createSchema: CreateAwsCertificateManagerPkiSyncSchema,
    updateSchema: UpdateAwsCertificateManagerPkiSyncSchema,
    syncOptions: {
      canImportCertificates: AWS_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: AWS_CERTIFICATE_MANAGER_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });
