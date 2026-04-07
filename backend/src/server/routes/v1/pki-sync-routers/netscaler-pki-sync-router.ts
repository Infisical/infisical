import {
  CreateNetScalerPkiSyncSchema,
  NETSCALER_PKI_SYNC_LIST_OPTION,
  NetScalerPkiSyncSchema,
  UpdateNetScalerPkiSyncSchema
} from "@app/services/pki-sync/netscaler";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerNetScalerPkiSyncRouter = async (server: FastifyZodProvider, enableOperationId: boolean = true) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.NetScaler,
    server,
    responseSchema: NetScalerPkiSyncSchema,
    createSchema: CreateNetScalerPkiSyncSchema,
    updateSchema: UpdateNetScalerPkiSyncSchema,
    syncOptions: {
      canImportCertificates: NETSCALER_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: NETSCALER_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });
