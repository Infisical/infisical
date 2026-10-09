import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

type TPaloAltoNetworksBasePkiSync = TRootPkiSync & {
  connection: {
    app: AppConnection.PaloAltoNetworks;
    name: string;
    id: string;
  };
};

export type TPaloAltoNetworksPkiSync = TPaloAltoNetworksBasePkiSync & {
  destination: PkiSync.PaloAltoNetworks;
  destinationConfig: {
    template?: string;
    pushToDevices: boolean;
  };
};

export type TPaloAltoNetworksSslTlsProfilePkiSync = TPaloAltoNetworksBasePkiSync & {
  destination: PkiSync.PaloAltoNetworksSslTlsProfile;
  destinationConfig: TPaloAltoNetworksPkiSync["destinationConfig"] & {
    sslTlsServiceProfileName: string;
    sslTlsServiceProfileVsys?: string;
  };
};
