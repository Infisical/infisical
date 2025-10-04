import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TAwsCertificateManagerPkiSync = TRootPkiSync & {
  destination: PkiSync.AwsCertificateManager;
  destinationConfig: {
    region: string;
  };
  connection: {
    app: AppConnection.AWS;
    name: string;
    id: string;
  };
};
