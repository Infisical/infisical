import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TImpervaSite = {
  id: string;
  name: string;
  status?: string;
};

export type TImpervaPkiSync = TRootPkiSync & {
  destination: PkiSync.Imperva;
  destinationConfig: {
    siteId: string;
    siteName?: string;
  };
  connection: {
    app: AppConnection.Imperva;
    name: string;
    id: string;
  };
};
