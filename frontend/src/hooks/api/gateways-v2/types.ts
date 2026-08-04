export type TGatewayV2 = {
  id: string;
  identityId: string | null;
  name: string;
  createdAt: string;
  updatedAt: string;
  heartbeat: string | null;
  heartbeatTTL: number | null;
  canRevoke: boolean;
  connectedResourcesCount: number;
  identity: {
    name: string;
    id: string;
  } | null;
  capabilities?: Record<string, unknown>;
};

export type GatewayAwsAuthConfig = {
  id: string;
  stsEndpoint: string;
  allowedPrincipalArns: string;
  allowedAccountIds: string;
  createdAt: string;
  updatedAt: string;
};

export type GatewayKubernetesAuthConfig = {
  id: string;
  kubernetesHost: string;
  allowedNamespaces: string;
  allowedNames: string;
  allowedAudience: string;
  verifyTlsCertificate: boolean;
  caCertificate: string;
  hasTokenReviewerJwt: boolean;
  createdAt: string;
  updatedAt: string;
};

export type GatewayTokenAuthConfig = Record<string, never>;

export type GatewayIdentityAuthConfig = {
  identityId: string;
  identityName: string | null;
};

export type GatewayAuthMethodView =
  | { method: "aws"; config: GatewayAwsAuthConfig }
  | { method: "kubernetes"; config: GatewayKubernetesAuthConfig }
  | { method: "token"; config: GatewayTokenAuthConfig }
  | { method: "identity"; config: GatewayIdentityAuthConfig };

export type TGatewayV2WithAuthMethod = TGatewayV2 & {
  authMethod: GatewayAuthMethodView;
};

export type SettableAuthMethodInput =
  | {
      method: "aws";
      stsEndpoint?: string;
      allowedPrincipalArns: string;
      allowedAccountIds: string;
    }
  | {
      method: "kubernetes";
      kubernetesHost: string;
      caCertificate?: string;
      // Write-only. Omitted means "keep the stored value"; an empty string clears it.
      tokenReviewerJwt?: string;
      allowedNamespaces: string;
      allowedNames: string;
      allowedAudience?: string;
      verifyTlsCertificate?: boolean;
    }
  | { method: "token" };

export type TGatewayEnrollmentToken = {
  token: string;
  expiresAt: string;
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

export type TGatewayConnectedKubernetesAuth = {
  id: string;
  identityId: string;
  identityName: string;
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
  kubernetesAuths: TGatewayConnectedKubernetesAuth[];
  pkiDiscoveryConfigs: TGatewayConnectedPkiDiscoveryConfig[];
};
