export type TGatewayV2 = {
  id: string;
  identityId: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  heartbeat: string;
  identity: {
    name: string;
    id: string;
  };
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
