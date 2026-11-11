import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export enum CloudflareBundleMethod {
  Ubiquitous = "ubiquitous",
  Optimal = "optimal",
  Force = "force"
}

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
