import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { TRootPkiSync } from "./common";

export enum CloudflareBundleMethod {
  Ubiquitous = "ubiquitous",
  Optimal = "optimal",
  Force = "force"
}

export const CLOUDFLARE_BUNDLE_METHOD_LABELS: Record<CloudflareBundleMethod, string> = {
  [CloudflareBundleMethod.Ubiquitous]: "Compatible",
  [CloudflareBundleMethod.Optimal]: "Modern",
  [CloudflareBundleMethod.Force]: "User-defined"
};

export const CLOUDFLARE_BUNDLE_METHOD_AUTOMATIC_LABEL = "Automatic";

export type TCloudflareCustomCertificatePkiSync = TRootPkiSync & {
  destination: PkiSync.CloudflareCustomCertificate;
  destinationConfig: {
    zoneId: string;
  };
  syncOptions: TRootPkiSync["syncOptions"] & {
    bundleMethod?: CloudflareBundleMethod;
  };
  connection: {
    app: AppConnection.Cloudflare;
    name: string;
    id: string;
  };
};
