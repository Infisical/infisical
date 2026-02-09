import {
  CLOUDFLARE_CUSTOM_CERTIFICATE_PKI_SYNC_LIST_OPTION,
  CloudflareCustomCertificatePkiSyncSchema,
  CreateCloudflareCustomCertificatePkiSyncSchema,
  UpdateCloudflareCustomCertificatePkiSyncSchema
} from "@app/services/pki-sync/cloudflare-custom-certificate";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerCloudflareCustomCertificatePkiSyncRouter = async (
  server: FastifyZodProvider,
  enableOperationId: boolean = true
) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.CloudflareCustomCertificate,
    server,
    responseSchema: CloudflareCustomCertificatePkiSyncSchema,
    createSchema: CreateCloudflareCustomCertificatePkiSyncSchema,
    updateSchema: UpdateCloudflareCustomCertificatePkiSyncSchema,
    syncOptions: {
      canImportCertificates: CLOUDFLARE_CUSTOM_CERTIFICATE_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: CLOUDFLARE_CUSTOM_CERTIFICATE_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });
