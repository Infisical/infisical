import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TNetScalerPkiSync = TRootPkiSync & {
  destination: PkiSync.NetScaler;
  destinationConfig: {
    vserverName?: string;
  };
  connection: {
    app: AppConnection.NetScaler;
    name: string;
    id: string;
  };
};
