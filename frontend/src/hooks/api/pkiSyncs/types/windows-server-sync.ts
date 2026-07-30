import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PemCertificateExtension, PkiSync, PkiSyncExportFormat, WindowsFileAccess } from "../enums";
import { TRootPkiSync } from "./common";

export type TWindowsServerPkiSync = TRootPkiSync & {
  destination: PkiSync.WindowsServer;
  destinationConfig: {
    destinationPath: string;
  };
  syncOptions: TRootPkiSync["syncOptions"] & {
    exportFormat?: PkiSyncExportFormat;
    pemCertificateExtension?: PemCertificateExtension;
    combineCertificateChain?: boolean;
    includePrivateKey?: boolean;
    fileAccessRules?: { identity: string; access: WindowsFileAccess }[];
  };
  connection: {
    app: AppConnection.WinRM;
    name: string;
    id: string;
  };
};
