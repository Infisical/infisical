export type TAiMcpEndpoint = {
  id: string;
  name: string;
  description: string | null;
  status: string | null;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  connectedServers: number;
  activeTools: number;
};

export type TAiMcpEndpointWithServerIds = TAiMcpEndpoint & {
  serverIds: string[];
};

export type TCreateAiMcpEndpointDTO = {
  projectId: string;
  name: string;
  description?: string;
  serverIds?: string[];
};

export type TUpdateAiMcpEndpointDTO = {
  endpointId: string;
  name?: string;
  description?: string;
  serverIds?: string[];
};

export type TDeleteAiMcpEndpointDTO = {
  endpointId: string;
};

export type TListAiMcpEndpointsDTO = {
  projectId: string;
};

export type TGetAiMcpEndpointDTO = {
  endpointId: string;
};

export type TAiMcpEndpointToolConfig = {
  id: string;
  aiMcpEndpointId: string;
  aiMcpServerToolId: string;
  isEnabled: boolean;
};

export type TListEndpointToolsDTO = {
  endpointId: string;
};

export type TEnableEndpointToolDTO = {
  endpointId: string;
  serverToolId: string;
};

export type TDisableEndpointToolDTO = {
  endpointId: string;
  serverToolId: string;
};

export type TBulkUpdateEndpointToolsDTO = {
  endpointId: string;
  tools: Array<{
    serverToolId: string;
    isEnabled: boolean;
  }>;
};

export type TFinalizeMcpEndpointOAuthDTO = {
  endpointId: string;
  response_type: string;
  client_id: string;
  code_challenge: string;
  code_challenge_method: string;
  redirect_uri: string;
  resource: string;
  expireIn: string;
};

// Personal credentials types
export type TServerAuthStatus = {
  id: string;
  name: string;
  url: string;
  hasCredentials: boolean;
};

export type TInitiateServerOAuthDTO = {
  endpointId: string;
  serverId: string;
};

export type TSaveUserServerCredentialDTO = {
  endpointId: string;
  serverId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
};
