import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PemCertificateExtension, PkiSync, PkiSyncExportFormat, WindowsFileAccess } from "../enums";
import { TRootPkiSync } from "./common";

export type TWindowsServerPkiSync = TRootPkiSync & {
  destination: PkiSync.WindowsServer;
  destinationConfig: {
    destinationPath: string;
    host?: string;
    port?: number;
    sslEnabled?: boolean;
    sslRejectUnauthorized?: boolean;
    sslCertificate?: string;
  };
  syncOptions: TRootPkiSync["syncOptions"] & {
    exportFormat?: PkiSyncExportFormat;
    pemCertificateExtension?: PemCertificateExtension;
    combineCertificateChain?: boolean;
    includePrivateKey?: boolean;
    fileAccessRules?: { identity: string; access: WindowsFileAccess }[];
    healthCheckCommand?: string | null;
    postSyncCommand?: string | null;
  };
  connection: {
    app: AppConnection;
    name: string;
    id: string;
  };
};
