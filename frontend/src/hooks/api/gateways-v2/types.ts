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
  connectedResourcesCount: number;
  identity: {
    name: string;
    id: string;
  } | null;
  enrollmentTokenStatus: "pending" | "expired" | null;
};

export type TGatewayEnrollmentToken = {
  id: string;
  ttl: number;
  expiresAt: string;
  usedAt: string | null;
  gatewayId: string | null;
  createdAt: string;
};

export type TCreateGatewayEnrollmentTokenResponse = TGatewayEnrollmentToken & {
  token: string;
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
