import {
  CreateNutanixPrismCentralPkiSyncSchema,
  NUTANIX_PRISM_CENTRAL_PKI_SYNC_LIST_OPTION,
  NutanixPrismCentralPkiSyncSchema,
  UpdateNutanixPrismCentralPkiSyncSchema
} from "@app/services/pki-sync/nutanix-prism-central";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerNutanixPrismCentralPkiSyncRouter = async (
  server: FastifyZodProvider,
  enableOperationId: boolean = true
) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.NutanixPrismCentral,
    server,
    responseSchema: NutanixPrismCentralPkiSyncSchema,
    createSchema: CreateNutanixPrismCentralPkiSyncSchema,
    updateSchema: UpdateNutanixPrismCentralPkiSyncSchema,
    syncOptions: {
      canImportCertificates: NUTANIX_PRISM_CENTRAL_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: NUTANIX_PRISM_CENTRAL_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });
