import { AiMcpServerAuthMethod, AiMcpServerCredentialMode } from "./ai-mcp-server-enum";

// OAuth types from MCP server
export type TOAuthAuthorizationServerMetadata = {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  registration_endpoint: string;
  scopes_supported?: string[];
  response_types_supported: string[];
  grant_types_supported?: string[];
  token_endpoint_auth_methods_supported?: string[];
  code_challenge_methods_supported?: string[];
};

export type TOAuthDynamicClientMetadata = {
  client_id: string;
  client_secret?: string;
  client_id_issued_at?: number;
  client_secret_expires_at?: number;
  redirect_uris: string[];
  token_endpoint_auth_method: string;
  grant_types: string[];
  response_types: string[];
  client_name?: string;
};

export type TOAuthTokenResponse = {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
};

// Credential types
export type TBasicCredentials = {
  username: string;
  password: string;
};

export type TBearerCredentials = {
  token: string;
};

export type TOAuthCredentials = {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
};

export type TAiMcpServerCredentials = TBasicCredentials | TBearerCredentials | TOAuthCredentials;

// OAuth session stored in keystore
export type TOAuthSession = {
  actorId: string;
  codeVerifier: string;
  codeChallenge: string;
  clientId: string;
  projectId: string;
  serverUrl: string;
  redirectUri: string;
  // Set after callback
  accessToken?: string;
  refreshToken?: string;
  expiresAt?: number;
  tokenType?: string;
  authorized?: boolean;
};

// DTO types
export type TInitiateOAuthDTO = {
  projectId: string;
  url: string;
  actorId: string;
  actor: string;
  actorAuthMethod: string;
  actorOrgId: string;
};

export type THandleOAuthCallbackDTO = {
  sessionId: string;
  code: string;
};

export type TGetOAuthStatusDTO = {
  sessionId: string;
  actorId: string;
};

export type TCreateAiMcpServerDTO = {
  projectId: string;
  name: string;
  url: string;
  description?: string;
  credentialMode: AiMcpServerCredentialMode;
  authMethod: AiMcpServerAuthMethod;
  credentials: TBasicCredentials | TBearerCredentials | TOAuthCredentials;
  actorId: string;
  actor: string;
  actorAuthMethod: string;
  actorOrgId: string;
};
