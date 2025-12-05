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

export type TGetAiMcpEndpointDTO = {
  endpointId: string;
};

export type TInteractWithMcpDTO = {
  endpointId: string;
};

export type TListAiMcpEndpointsDTO = {
  projectId: string;
};

export type TAiMcpEndpointWithServers = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  connectedServers: number;
  activeTools: number;
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

export type TEndpointToolConfig = {
  id: string;
  aiMcpEndpointId: string;
  aiMcpServerToolId: string;
  isEnabled: boolean;
};

// OAuth 2.0 Types
export type TOAuthRegisterClientDTO = {
  endpointId: string;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
  client_name: string;
  client_uri?: string;
};

export type TOAuthAuthorizeClientDTO = {
  clientId: string;
  state?: string;
};

export type TOAuthFinalizeDTO = {
  endpointId: string;
  clientId: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  redirectUri: string;
  resource: string;
  responseType: string;
  projectId: string;
  path?: string;
  expiry: string;
  tokenId: string;
  userInfo: {
    id: string;
    email?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  };
  permission: {
    type: string;
    id: string;
    orgId: string;
    authMethod: string | null;
  };
  userAgent: string;
  userIp: string;
};

export type TOAuthTokenExchangeDTO = {
  endpointId: string;
  grant_type: "authorization_code";
  code: string;
  redirect_uri: string;
  code_verifier: string;
  client_id: string;
};
