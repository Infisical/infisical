import { PkiSync } from "@app/services/pki-sync/pki-sync-enums";
import {
  CreateWindowsServerPkiSyncSchema,
  UpdateWindowsServerPkiSyncSchema,
  WINDOWS_SERVER_PKI_SYNC_LIST_OPTION,
  WindowsServerPkiSyncSchema
} from "@app/services/pki-sync/windows-server";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

export const registerWindowsServerPkiSyncRouter = async (
  server: FastifyZodProvider,
  enableOperationId: boolean = true
) =>
  registerSyncPkiEndpoints({
    destination: PkiSync.WindowsServer,
    server,
    responseSchema: WindowsServerPkiSyncSchema,
    createSchema: CreateWindowsServerPkiSyncSchema,
    updateSchema: UpdateWindowsServerPkiSyncSchema,
    syncOptions: {
      canImportCertificates: WINDOWS_SERVER_PKI_SYNC_LIST_OPTION.canImportCertificates,
      canRemoveCertificates: WINDOWS_SERVER_PKI_SYNC_LIST_OPTION.canRemoveCertificates
    },
    enableOperationId
  });
