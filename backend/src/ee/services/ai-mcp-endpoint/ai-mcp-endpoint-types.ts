import { TProjectPermission } from "@app/lib/types";

export type TCreateAiMcpEndpointDTO = {
  name: string;
  description?: string;
  serverIds?: string[];
} & TProjectPermission;

export type TUpdateAiMcpEndpointDTO = {
  endpointId: string;
  name?: string;
  description?: string;
  serverIds?: string[];
  piiRequestFiltering?: boolean;
  piiResponseFiltering?: boolean;
  piiEntityTypes?: string[];
} & Omit<TProjectPermission, "projectId">;

export type TDeleteAiMcpEndpointDTO = {
  endpointId: string;
} & Omit<TProjectPermission, "projectId">;

export type TGetAiMcpEndpointDTO = {
  endpointId: string;
} & Omit<TProjectPermission, "projectId">;

export type TInteractWithMcpDTO = {
  endpointId: string;
  userId: string;
} & Omit<TProjectPermission, "projectId">;

export type TListAiMcpEndpointsDTO = TProjectPermission;

export type TAiMcpEndpointWithServers = {
  id: string;
  name: string;
  description?: string | null;
  status?: string | null;
  piiRequestFiltering?: boolean;
  piiResponseFiltering?: boolean;
  piiEntityTypes?: string[] | null;
  projectId: string;
  createdAt: Date;
  updatedAt: Date;
  connectedServers: number;
  activeTools: number;
};

export type TListEndpointToolsDTO = {
  endpointId: string;
} & Omit<TProjectPermission, "projectId">;

export type TEnableEndpointToolDTO = {
  endpointId: string;
  serverToolId: string;
} & Omit<TProjectPermission, "projectId">;

export type TDisableEndpointToolDTO = {
  endpointId: string;
  serverToolId: string;
} & Omit<TProjectPermission, "projectId">;

export type TBulkUpdateEndpointToolsDTO = {
  endpointId: string;
  tools: Array<{
    serverToolId: string;
    isEnabled: boolean;
  }>;
} & Omit<TProjectPermission, "projectId">;

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
  resource?: string;
  responseType: string;
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

// Personal credentials types
export type TGetServersRequiringAuthDTO = {
  endpointId: string;
} & Omit<TProjectPermission, "projectId">;

export type TServerAuthStatus = {
  id: string;
  name: string;
  url: string;
  hasCredentials: boolean;
  authMethod: string;
  oauthClientId?: string;
  oauthClientSecret?: string;
};

export type TInitiateServerOAuthDTO = {
  endpointId: string;
  serverId: string;
} & Omit<TProjectPermission, "projectId">;

export type TSaveUserServerCredentialDTO = {
  endpointId: string;
  serverId: string;
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
} & Omit<TProjectPermission, "projectId">;

export type TVerifyServerBearerTokenDTO = {
  endpointId: string;
  serverId: string;
  accessToken: string;
} & Omit<TProjectPermission, "projectId">;
