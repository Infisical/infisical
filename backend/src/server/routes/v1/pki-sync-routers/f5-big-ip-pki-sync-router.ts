import {
  CreateF5BigIpPkiSyncSchema,
  F5_BIG_IP_PKI_SYNC_LIST_OPTION,
  F5BigIpPkiSyncSchema,
  UpdateF5BigIpPkiSyncSchema
} from "@app/services/pki-sync/f5-big-ip";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerF5BigIpPkiSyncRouter = async (server: FastifyZodProvider, enableOperationId: boolean = true) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.F5BigIp,
    server,
    responseSchema: F5BigIpPkiSyncSchema,
    createSchema: CreateF5BigIpPkiSyncSchema,
    updateSchema: UpdateF5BigIpPkiSyncSchema,
    syncOptions: {
      canImportCertificates: F5_BIG_IP_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: F5_BIG_IP_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });
