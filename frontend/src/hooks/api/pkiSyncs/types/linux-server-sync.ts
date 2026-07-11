import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync, PkiSyncExportFormat } from "../enums";
import { TRootPkiSync } from "./common";

export type TLinuxServerPkiSync = TRootPkiSync & {
  destination: PkiSync.LinuxServer;
  destinationConfig: {
    destinationPath: string;
  };
  syncOptions: TRootPkiSync["syncOptions"] & {
    exportFormat?: PkiSyncExportFormat;
    includePrivateKey?: boolean;
  };
  connection: {
    app: AppConnection.SSH;
    name: string;
    id: string;
  };
};
