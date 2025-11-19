import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TChefPkiSync = TRootPkiSync & {
  destination: PkiSync.Chef;
  destinationConfig: {
    dataBagName: string;
  };
  connection: {
    app: AppConnection.Chef;
    name: string;
    id: string;
  };
};
