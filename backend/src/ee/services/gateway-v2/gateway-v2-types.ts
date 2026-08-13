import { z } from "zod";

// Reported by the gateway on every heartbeat, and stored as a whole-object replace, so a gateway
// that omits a key is asserting it does not have that capability.
export const GatewayCapabilitiesSchema = z.object({
  pkcs11: z.boolean().optional(),
  agentProxy: z.boolean().optional(),
  agentProxyProtocol: z.number().int().min(1).max(1000).optional()
});

export type TGatewayCapabilities = z.infer<typeof GatewayCapabilitiesSchema>;

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

export type TGatewayConnectedKubernetesAuth = {
  id: string;
  identityId: string;
  identityName: string;
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
  kubernetesAuths: TGatewayConnectedKubernetesAuth[];
  pkiDiscoveryConfigs: TGatewayConnectedPkiDiscoveryConfig[];
};
