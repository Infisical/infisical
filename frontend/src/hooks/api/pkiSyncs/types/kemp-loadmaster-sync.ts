import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TKempVirtualService = {
  id: string;
  name: string;
  address: string;
  port: number;
  protocol: string;
};

export type TKempLoadMasterPkiSync = TRootPkiSync & {
  destination: PkiSync.KempLoadMaster;
  destinationConfig: {
    virtualServiceId?: string;
  };
  connection: {
    app: AppConnection.KempLoadMaster;
    name: string;
    id: string;
  };
};
