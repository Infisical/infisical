import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync, PkiSyncExportFormat } from "../enums";
import { TRootPkiSync } from "./common";

export type TWindowsServerPkiSync = TRootPkiSync & {
  destination: PkiSync.WindowsServer;
  destinationConfig: {
    destinationPath: string;
  };
  syncOptions: TRootPkiSync["syncOptions"] & {
    exportFormat?: PkiSyncExportFormat;
    includePrivateKey?: boolean;
  };
  connection: {
    app: AppConnection.WinRM;
    name: string;
    id: string;
  };
};
