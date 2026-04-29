export enum GatewayHealthCheckStatus {
  Healthy = "healthy",
  Failed = "failed"
}

export type TGatewayV2 = {
  id: string;
  identityId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
  heartbeat: string | null;
  lastHealthCheckStatus: GatewayHealthCheckStatus | null;
  // tokenVersion gates the Revoke button: when > 0, this gateway has either logged in
  // at some point or had its method switched, both of which mean a JWT may exist.
  tokenVersion: number;
  connectedResourcesCount: number;
  identity: {
    name: string;
    id: string;
  } | null;
};

export type GatewayAuthMethod = "aws" | "token" | "identity";

export type GatewayAwsAuthConfig = {
  id: string;
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
  createdAt: string;
  updatedAt: string;
};

// Token method has no client-visible config — enrollment-token rows are deleted on
// consume, so there's no surfaced state. Empty object keeps the discriminated union
// shape consistent with AWS / Identity.
export type GatewayTokenAuthConfig = Record<string, never>;

export type GatewayIdentityAuthConfig = {
  identityId: string;
  identityName: string | null;
};

export type GatewayAuthMethodView =
  | { method: "aws"; config: GatewayAwsAuthConfig }
  | { method: "token"; config: GatewayTokenAuthConfig }
  | { method: "identity"; config: GatewayIdentityAuthConfig };

export type TGatewayV2WithAuthMethod = TGatewayV2 & {
  authMethod: GatewayAuthMethodView;
};

// Body for POST /v3/gateways and PATCH /v3/gateways/:id (the auth-method portion only).
export type SettableAuthMethodInput =
  | {
      method: "aws";
      stsEndpoint?: string;
      allowedPrincipalArns: string;
      allowedAccountIds: string;
    }
  | { method: "token" };

export type TGatewayEnrollmentToken = {
  token: string;
  expiresAt: string;
  ttl: number;
};

export type TGatewayConnectedAppConnection = {
  id: string;
  name: string;
  app: string;
  projectId?: string | null;
  projectName?: string | null;
};

export type TGatewayConnectedDynamicSecret = {
  id: string;
  name: string;
  folderId: string;
  projectId: string;
  projectName: string;
  environmentSlug: string;
};

export type TGatewayConnectedPamResource = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  resourceType: string;
};

export type TGatewayConnectedPamDiscoverySource = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  discoveryType: string;
};

export type TGatewayConnectedKubernetesAuth = {
  id: string;
  identityId: string;
  identityName: string;
};

export type TGatewayConnectedMcpServer = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
};

export type TGatewayConnectedPkiDiscoveryConfig = {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
};

export type TGatewayConnectedResources = {
  appConnections: TGatewayConnectedAppConnection[];
  dynamicSecrets: TGatewayConnectedDynamicSecret[];
  pamResources: TGatewayConnectedPamResource[];
  pamDiscoverySources: TGatewayConnectedPamDiscoverySource[];
  kubernetesAuths: TGatewayConnectedKubernetesAuth[];
  mcpServers: TGatewayConnectedMcpServer[];
  pkiDiscoveryConfigs: TGatewayConnectedPkiDiscoveryConfig[];
};
