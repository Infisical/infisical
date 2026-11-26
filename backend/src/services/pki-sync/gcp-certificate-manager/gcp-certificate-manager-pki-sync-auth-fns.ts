import { getGcpConnectionAuthToken } from "@app/services/app-connection/gcp/gcp-connection-fns";
import { TGcpConnectionAuthDeps, TGcpConnectionForAuth } from "@app/services/app-connection/gcp/gcp-connection-types";

import { TPkiSyncWithCredentials } from "../pki-sync-types";

export const getGcpAccessToken = async (pkiSync: TPkiSyncWithCredentials, authDeps: TGcpConnectionAuthDeps) =>
  getGcpConnectionAuthToken(pkiSync.connection as unknown as TGcpConnectionForAuth, authDeps);
