import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PemCertificateExtension, PkiSync, PkiSyncExportFormat } from "../enums";
import { TRootPkiSync } from "./common";

export type TLinuxServerPkiSync = TRootPkiSync & {
  destination: PkiSync.LinuxServer;
  destinationConfig: {
    destinationPath: string;
  };
  syncOptions: TRootPkiSync["syncOptions"] & {
    exportFormat?: PkiSyncExportFormat;
    pemCertificateExtension?: PemCertificateExtension;
    combineCertificateChain?: boolean;
    includePrivateKey?: boolean;
    fileMode?: string;
    privateKeyFileMode?: string;
    owner?: string;
    group?: string;
  };
  connection: {
    app: AppConnection.SSH;
    name: string;
    id: string;
  };
};
