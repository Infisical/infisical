import { OrderByDirection } from "@app/lib/types";

import { AgentGatewayUnmatchedHostPolicy } from "./agent-gateway-enums";

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
  // Explicit null clears the transport, which is how an agent gateway becomes local-only again.
  gatewayId?: string | null;
  gatewayPoolId?: string | null;
  isLocalModeEnabled?: boolean;
  unmatchedHostPolicy?: AgentGatewayUnmatchedHostPolicy;
  allowedHosts?: string[];
};

export type TGetAgentGatewayByIdDTO = {
  agentGatewayId: string;
};

export type TGetAgentGatewayByNameDTO = {
  projectId: string;
  name: string;
};

export type TDeleteAgentGatewayDTO = {
  agentGatewayId: string;
};

export type TListAgentGatewaysDTO = {
  projectId: string;
  search?: string;
  orderDirection?: OrderByDirection;
  limit?: number;
  offset?: number;
};

export type TLinkProxiedServiceDTO = {
  agentGatewayId: string;
  serviceId: string;
};

export type TReorderProxiedServicesDTO = {
  agentGatewayId: string;
  serviceIds: string[];
};
