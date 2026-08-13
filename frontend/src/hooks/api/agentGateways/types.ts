// Where a request goes when no connected proxied service matches its host. Configured on the agent gateway,
// so an agent cannot choose its own passthrough behaviour.
export enum AgentGatewayUnmatchedHostPolicy {
  Allow = "allow",
  Block = "block"
}

export enum AgentGatewayPrincipalKind {
  User = "user",
  Identity = "identity",
  Group = "group"
}

export enum AgentGatewaySessionMode {
  Remote = "remote",
  Local = "local"
}

// Health and CLI support are decided by the server, so the dashboard shows the same answer the server acts
// on rather than re-deriving "reachable" from a heartbeat pair.
export type TAgentGatewayTransport = {
  id: string;
  name: string;
  isHealthy: boolean;
  supportsAgentProxy: boolean;
};

export type TAgentGatewayPool = {
  id: string;
  name: string;
};

export type TAgentGatewayBase = {
  id: string;
  name: string;
  description: string | null;
  projectId: string;
  isLocalModeEnabled: boolean;
  unmatchedHostPolicy: AgentGatewayUnmatchedHostPolicy;
  allowedHosts: string[];
  lastUsedAt: string | null;
  createdAt: string;
  updatedAt: string;
  gateway: TAgentGatewayTransport | null;
  gatewayPool: TAgentGatewayPool | null;
};

// Ordered by priority: the order decides which service wins when two match the same host.
export type TAgentGatewayLinkedService = {
  id: string;
  name: string;
  hostPattern: string;
  isEnabled: boolean;
  priority: number;
  lastUsedAt?: string | null;
};

export type TAgentGateway = TAgentGatewayBase & {
  proxiedServices: TAgentGatewayLinkedService[];
};

export type TAgentGatewayListItem = TAgentGatewayBase & {
  proxiedServiceCount: number;
  // Principals on the access list: users, machine identities and groups, counted per grant.
  accessCount: number;
};

export type TAgentGatewayAccessEntry = {
  id: string;
  kind: AgentGatewayPrincipalKind;
  principalId: string;
  name: string;
  email: string | null;
  createdAt: string;
};

export type TCreateAgentGatewayDTO = {
  projectId: string;
  name: string;
  description?: string;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  isLocalModeEnabled?: boolean;
  unmatchedHostPolicy?: AgentGatewayUnmatchedHostPolicy;
  allowedHosts?: string[];
};

export type TUpdateAgentGatewayDTO = {
  agentGatewayId: string;
  name?: string;
  description?: string | null;
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  isLocalModeEnabled?: boolean;
  unmatchedHostPolicy?: AgentGatewayUnmatchedHostPolicy;
  allowedHosts?: string[];
};

export type TDeleteAgentGatewayDTO = {
  agentGatewayId: string;
};

export type TAgentGatewayServiceLinkDTO = {
  agentGatewayId: string;
  serviceId: string;
};

export type TReorderAgentGatewayServicesDTO = {
  agentGatewayId: string;
  serviceIds: string[];
};

export type TAgentGatewayAccessDTO = {
  agentGatewayId: string;
  kind: AgentGatewayPrincipalKind;
  principalId: string;
};

export type TAgentGatewaySession = {
  id: string;
  mode: string;
  status: string;
  actorName: string;
  actorType: string;
  gatewayId: string | null;
  expiresAt: string;
  endedAt: string | null;
  createdAt: string;
  requestCount: number;
  brokeredCount: number;
};

// Names only. A recorded request never carries a resolved value, a header value or a body.
export type TAgentGatewaySessionRequestCredential = {
  key?: string;
  dynamicSecretName?: string;
  dynamicSecretField?: string;
  role?: string;
  header?: string;
  surfaces?: string[];
};

export type TAgentGatewaySessionRequest = {
  id: string;
  occurredAt: string;
  method: string;
  host: string;
  port: number | null;
  path: string | null;
  decision: string;
  statusCode: number | null;
  serviceName: string | null;
  credentials: TAgentGatewaySessionRequestCredential[];
  errorMessage: string | null;
};
