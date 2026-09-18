import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export enum F5BigIpProfileType {
  None = "none",
  ClientSsl = "client-ssl",
  ServerSsl = "server-ssl"
}

export type TF5BigIpPkiSync = TRootPkiSync & {
  destination: PkiSync.F5BigIp;
  destinationConfig: {
    partition?: string;
    profileType?: F5BigIpProfileType;
    profileName?: string;
    createProfileIfMissing?: boolean;
    parentProfile?: string;
  };
  connection: {
    app: AppConnection.F5BigIp;
    name: string;
    id: string;
  };
};
