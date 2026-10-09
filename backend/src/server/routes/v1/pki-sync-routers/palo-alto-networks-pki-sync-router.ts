import {
  PALO_ALTO_NETWORKS_PKI_SYNC_LIST_OPTION,
  PALO_ALTO_NETWORKS_SSL_TLS_PROFILE_PKI_SYNC_LIST_OPTION,
  PaloAltoNetworksPkiSyncSchemas,
  PaloAltoNetworksSslTlsProfilePkiSyncSchemas
} from "@app/services/pki-sync/palo-alto-networks";

import { registerSyncPkiEndpoints } from "./pki-sync-endpoints";

const registerRouter =
  (
    listOption:
      | typeof PALO_ALTO_NETWORKS_PKI_SYNC_LIST_OPTION
      | typeof PALO_ALTO_NETWORKS_SSL_TLS_PROFILE_PKI_SYNC_LIST_OPTION,
    schemas: typeof PaloAltoNetworksPkiSyncSchemas | typeof PaloAltoNetworksSslTlsProfilePkiSyncSchemas
  ) =>
  async (server: FastifyZodProvider, enableOperationId: boolean = true) =>
    registerSyncPkiEndpoints({
      destination: listOption.destination,
      server,
      ...schemas,
      syncOptions: {
        canImportCertificates: listOption.canImportCertificates,
        canRemoveCertificates: listOption.canRemoveCertificates,
        canRunHealthCheckCommand: listOption.canRunHealthCheckCommand
      },
      enableOperationId
    });

export const registerPaloAltoNetworksPkiSyncRouter = registerRouter(
  PALO_ALTO_NETWORKS_PKI_SYNC_LIST_OPTION,
  PaloAltoNetworksPkiSyncSchemas
);

export const registerPaloAltoNetworksSslTlsProfilePkiSyncRouter = registerRouter(
  PALO_ALTO_NETWORKS_SSL_TLS_PROFILE_PKI_SYNC_LIST_OPTION,
  PaloAltoNetworksSslTlsProfilePkiSyncSchemas
);
