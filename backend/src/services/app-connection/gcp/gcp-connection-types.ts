import z from "zod";

import { TInstanceConfigService } from "@app/domains/platform/instance-config-core/ce/module";
import { DiscriminativePick } from "@app/lib/types";
import { TCipherPairSource } from "@app/services/app-connection/app-connection-fns";
import { TOidcIssuerServiceFactory } from "@app/services/oidc-issuer/oidc-issuer-service";

import { TAppConnectionDALFactory } from "../app-connection-dal";
import { AppConnection } from "../app-connection-enums";
import {
  CreateGcpConnectionSchema,
  GcpConnectionFederatedCredentialSchema,
  GcpConnectionSchema,
  GcpConnectionWorkloadIdentityFederationOutputCredentialsSchema,
  ValidateGcpConnectionCredentialsSchema
} from "./gcp-connection-schemas";

export type TGcpConnection = z.infer<typeof GcpConnectionSchema>;

export type TGcpConnectionInput = z.infer<typeof CreateGcpConnectionSchema> & {
  app: AppConnection.GCP;
};

export type TValidateGcpConnectionCredentialsSchema = typeof ValidateGcpConnectionCredentialsSchema;

export type TGcpConnectionConfig = DiscriminativePick<TGcpConnectionInput, "method" | "app" | "credentials"> & {
  orgId: string;
  projectId?: string | null;
  // Only set when validating an existing connection; a new one has no ID for GCP to trust yet
  connection?: { id: string; name: string };
};

export type TGcpConnectionWorkloadIdentityFederationCredentials = z.infer<
  typeof GcpConnectionWorkloadIdentityFederationOutputCredentialsSchema
>;

export type TGcpConnectionFederatedCredential = z.infer<typeof GcpConnectionFederatedCredentialSchema>;

// What a caller needs to get a token for a stored connection. Impersonation reads Infisical's own service account
// from the instance config; workload identity federation signs a token, and caches GCP's access token in the
// connection's credentials.
export type TGcpConnectionAuthDeps = {
  appConnectionDAL: Pick<TAppConnectionDALFactory, "findById" | "update">;
  kmsDataKeyService: TCipherPairSource;
  oidcIssuerService: Pick<TOidcIssuerServiceFactory, "signToken">;
  instanceConfigService: Pick<TInstanceConfigService, "getOverridableEnv">;
};

export type TGcpConnectionForAuth = Pick<TGcpConnection, "id" | "orgId" | "method" | "credentials">;

export type GCPApp = {
  projectNumber: string;
  projectId: string;
  lifecycleState: "ACTIVE" | "LIFECYCLE_STATE_UNSPECIFIED" | "DELETE_REQUESTED" | "DELETE_IN_PROGRESS";
  name: string;
  createTime: string;
  parent: {
    type: "organization" | "folder" | "project";
    id: string;
  };
};

export type GCPGetProjectsRes = {
  projects: GCPApp[];
  nextPageToken?: string;
};

export type GCPLocation = {
  name: string;
  locationId: string;
  displayName: string;
};

export type GCPGetProjectLocationsRes = {
  locations: GCPLocation[];
  nextPageToken?: string;
};

export type TGetGCPProjectLocationsDTO = {
  projectId: string;
  connectionId: string;
};

export type GCPGetServiceRes = {
  name: string;
  parent: string;
  state: "ENABLED" | "DISABLED" | "STATE_UNSPECIFIED";
};

export type GCPCertificateMap = {
  name: string;
  description?: string;
};

export type GCPGetCertificateMapsRes = {
  certificateMaps?: GCPCertificateMap[];
  nextPageToken?: string;
};

export type TGcpCertificateManagerProjectScopedDTO = {
  connectionId: string;
  gcpProjectId: string;
};

export type GCPCloudDnsManagedZone = {
  name: string;
  dnsName: string;
  visibility?: "public" | "private";
};

export type GCPGetCloudDnsManagedZonesRes = {
  managedZones?: GCPCloudDnsManagedZone[];
  nextPageToken?: string;
};
