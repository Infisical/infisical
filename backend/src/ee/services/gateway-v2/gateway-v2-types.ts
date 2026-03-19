export type TGatewayV2ConnectionDetails = {
  relayHost: string;
  gateway: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
  relay: {
    clientCertificate: string;
    clientPrivateKey: string;
    serverCertificateChain: string;
  };
};

export type TGatewayConnectedAppConnection = {
  id: string;
  name: string;
  app: string;
  projectId?: string | null;
  projectName?: string;
};

export type TGatewayConnectedDynamicSecret = {
  id: string;
  name: string;
  folderId: string;
  projectId?: string;
  projectName?: string;
  environmentSlug?: string;
};

export type TGatewayConnectedPamResource = {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
  resourceType: string;
};

export type TGatewayConnectedPamDiscoverySource = {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
};

export type TGatewayConnectedKubernetesAuth = {
  id: string;
  identityId: string;
};

export type TGatewayConnectedMcpServer = {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
};

export type TGatewayConnectedPkiDiscoveryConfig = {
  id: string;
  name: string;
  projectId: string;
  projectName?: string;
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
