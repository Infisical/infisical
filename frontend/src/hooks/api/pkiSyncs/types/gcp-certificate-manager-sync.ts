import { AppConnection } from "@app/hooks/api/appConnections/enums";

import { PkiSync } from "../enums";
import { RootPkiSyncOptions, TRootPkiSync } from "./common";

export const GCP_CERTIFICATE_MANAGER_GLOBAL_LOCATION = "global";

export const GCP_MAX_CERTIFICATES_PER_MAP_ENTRY = 4;

export enum GcpCertificateManagerScope {
  Default = "default",
  EdgeCache = "edge-cache",
  AllRegions = "all-regions",
  ClientAuth = "client-auth"
}

export const GCP_CERTIFICATE_MANAGER_SCOPES: Record<
  GcpCertificateManagerScope,
  { label: string; description: string }
> = {
  [GcpCertificateManagerScope.Default]: {
    label: "Default",
    description: "Global external Application Load Balancers and regional services."
  },
  [GcpCertificateManagerScope.EdgeCache]: {
    label: "Edge Cache",
    description: "Media CDN."
  },
  [GcpCertificateManagerScope.AllRegions]: {
    label: "All Regions",
    description: "Cross-region internal Application Load Balancers. Global certificates only."
  },
  [GcpCertificateManagerScope.ClientAuth]: {
    label: "Client Authentication",
    description: "Backend mTLS client certificates."
  }
};

export type TGcpLabel = {
  key: string;
  value: string;
};

export type TGcpCertificateManagerPkiSync = TRootPkiSync & {
  destination: PkiSync.GcpCertificateManager;
  destinationConfig: {
    gcpProjectId: string;
    location: string;
    scope: GcpCertificateManagerScope;
    certificateMapBinding?: {
      certificateMap: string;
      hostname?: string;
    };
  };
  syncOptions: RootPkiSyncOptions & {
    labels?: TGcpLabel[];
  };
  connection: {
    app: AppConnection.GCP;
    name: string;
    id: string;
  };
};
