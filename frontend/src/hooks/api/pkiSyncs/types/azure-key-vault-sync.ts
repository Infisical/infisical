import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TAzureKeyVaultPkiSync = TRootPkiSync & {
  destination: PkiSync.AzureKeyVault;
  destinationConfig: {
    vaultBaseUrl: string;
  };
  connection: {
    app: AppConnection.AzureKeyVault;
    name: string;
    id: string;
  };
};
