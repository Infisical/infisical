import { getGcpConnectionAuthToken } from "@app/services/app-connection/gcp/gcp-connection-fns";
import { TGcpConnectionConfig } from "@app/services/app-connection/gcp/gcp-connection-types";

import { PkiSyncError } from "../pki-sync-errors";
import { TPkiSyncWithCredentials } from "../pki-sync-types";

export const getGcpAccessToken = async (pkiSync: TPkiSyncWithCredentials) => {
  const { connection } = pkiSync;
  const credentials = connection.credentials as { serviceAccountEmail?: string } | undefined;

  if (!credentials?.serviceAccountEmail) {
    throw new PkiSyncError({
      shouldRetry: false,
      message: "The GCP app connection is missing a service account email."
    });
  }

  return getGcpConnectionAuthToken({
    app: connection.app,
    method: connection.method,
    credentials: { serviceAccountEmail: credentials.serviceAccountEmail },
    orgId: connection.orgId
  } as TGcpConnectionConfig);
};
