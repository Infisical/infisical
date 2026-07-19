import {
  CreateLinuxServerPkiSyncSchema,
  LINUX_SERVER_PKI_SYNC_LIST_OPTION,
  LinuxServerPkiSyncSchema,
  UpdateLinuxServerPkiSyncSchema
} from "@app/services/pki-sync/linux-server";
import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerLinuxServerPkiSyncRouter = async (server: FastifyZodProvider, enableOperationId: boolean = true) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.LinuxServer,
    server,
    responseSchema: LinuxServerPkiSyncSchema,
    createSchema: CreateLinuxServerPkiSyncSchema,
    updateSchema: UpdateLinuxServerPkiSyncSchema,
    syncOptions: {
      canImportCertificates: LINUX_SERVER_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: LINUX_SERVER_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });
