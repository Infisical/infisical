import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export type TCloudflareCustomCertificatePkiSync = TRootPkiSync & {
  destination: PkiSync.CloudflareCustomCertificate;
  destinationConfig: {
    zoneId: string;
  };
  connection: {
    app: AppConnection.Cloudflare;
    name: string;
    id: string;
  };
};
