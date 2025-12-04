export enum AiMcpServerCredentialMode {
  SHARED = "shared",
  PERSONAL = "personal"
}

export enum AiMcpServerAuthMethod {
  BASIC = "basic",
  BEARER = "bearer",
  OAUTH = "oauth"
}

export enum AiMcpServerStatus {
  ACTIVE = "active",
  INACTIVE = "inactive",
  UNINITIALIZED = "uninitialized"
}

// Basic auth credentials
export type TBasicAuthCredentials = {
  authMethod: AiMcpServerAuthMethod.BASIC;
  credentials: {
    username: string;
    password: string;
  };
};

// Bearer token credentials
export type TBearerAuthCredentials = {
  authMethod: AiMcpServerAuthMethod.BEARER;
  credentials: {
    token: string;
  };
};

// OAuth credentials (obtained after OAuth flow)
export type TOAuthCredentials = {
  authMethod: AiMcpServerAuthMethod.OAUTH;
  credentials: {
    accessToken: string;
    refreshToken?: string;
    expiresAt?: number;
    tokenType?: string;
  };
};

export type TAiMcpServerCredentials =
  | TBasicAuthCredentials
  | TBearerAuthCredentials
  | TOAuthCredentials;

export type TAiMcpServer = {
  id: string;
  name: string;
  url: string;
  description?: string;
  status: AiMcpServerStatus;
  credentialMode: AiMcpServerCredentialMode;
  authMethod: AiMcpServerAuthMethod;
  projectId: string;
  toolsCount?: number;
  createdAt: string;
  updatedAt: string;
};

// Create MCP Server DTOs
export type TCreateAiMcpServerDTO = {
  projectId: string;
  name: string;
  url: string;
  description?: string;
  credentialMode: AiMcpServerCredentialMode;
} & TAiMcpServerCredentials;

// OAuth initiate DTO
export type TInitiateOAuthDTO = {
  projectId: string;
  url: string;
};

export type TInitiateOAuthResponse = {
  authUrl: string;
  sessionId: string;
};

// OAuth status DTO
export type TGetOAuthStatusDTO = {
  sessionId: string;
};

export type TOAuthStatusResponse = {
  authorized: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
};

// List MCP Servers DTO
export type TListAiMcpServersDTO = {
  projectId: string;
  limit?: number;
  offset?: number;
};

// Delete MCP Server DTO
export type TDeleteAiMcpServerDTO = {
  serverId: string;
};
