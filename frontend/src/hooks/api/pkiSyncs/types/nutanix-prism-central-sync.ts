import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TNutanixPrismCentralPkiSync = TRootPkiSync & {
  destination: PkiSync.NutanixPrismCentral;
  destinationConfig: {
    clusterId: string;
    clusterName: string;
  };
  connection: {
    app: AppConnection.NutanixPrismCentral;
    name: string;
    id: string;
  };
};
